"""Mayells voice concierge.

Answers the Mayells phone lines (LiveKit SIP, see dispatch-rule.json) with an
xAI realtime voice. It knows which number was dialled, so a caller on the
Jupiter line is greeted as the Jupiter office, and it can:

  * record an appraisal request, which becomes a prospect in the admin
    (or adds to the caller's existing one) and emails the team;
  * email the caller the private photo-upload link while they are on the line;
  * transfer the caller to a specialist during business hours.

Calls are noted, not recorded: when a call ends the conversation is sent to
the app once, turned into short notes on the call (and on the caller's
prospect), and discarded. No audio or transcript is kept. The app does the
record keeping; this worker only talks to it over HTTP (MAYELLS_API_URL,
authenticated with VOICE_AGENT_SECRET).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import aiohttp
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import Agent, AgentServer, AgentSession, RunContext, function_tool, room_io
from livekit.plugins import noise_cancellation, xai

load_dotenv(".env.local")

logger = logging.getLogger("mayells-voice")

API_URL = os.environ.get("MAYELLS_API_URL", "https://mayells.com").rstrip("/")
AGENT_SECRET = os.environ.get("VOICE_AGENT_SECRET", "")
# E.164 number a specialist answers. Unset = no live transfers, callbacks only.
TRANSFER_NUMBER = os.environ.get("TRANSFER_NUMBER", "").strip()
# When transfers are offered, Eastern time, e.g. "Mon-Fri 09:00-18:00".
TRANSFER_HOURS = os.environ.get("TRANSFER_HOURS", "Mon-Fri 09:00-18:00")
# A runaway or abusive call is wrapped up after this long.
MAX_CALL_MINUTES = float(os.environ.get("MAX_CALL_MINUTES", "15"))

EASTERN = ZoneInfo("America/New_York")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def transfers_open(now: datetime | None = None) -> bool:
    """Whether TRANSFER_HOURS covers the current Eastern time."""
    if not TRANSFER_NUMBER:
        return False
    m = re.fullmatch(
        r"\s*(\w{3})\s*-\s*(\w{3})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*",
        TRANSFER_HOURS.lower(),
    )
    if not m or m.group(1) not in DAYS or m.group(2) not in DAYS:
        logger.warning("TRANSFER_HOURS %r not understood; transfers off", TRANSFER_HOURS)
        return False
    now = now or datetime.now(EASTERN)
    first, last = DAYS.index(m.group(1)), DAYS.index(m.group(2))
    open_min = int(m.group(3)) * 60 + int(m.group(4))
    close_min = int(m.group(5)) * 60 + int(m.group(6))
    minute = now.hour * 60 + now.minute
    return first <= now.weekday() <= last and open_min <= minute < close_min


class MayellsApi:
    """The app's /api/voice/agent endpoints."""

    def __init__(self) -> None:
        self._http = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=15),
            headers={"Authorization": f"Bearer {AGENT_SECRET}"},
        )

    async def post(self, path: str, body: dict, attempts: int = 2) -> dict | None:
        for attempt in range(attempts):
            try:
                async with self._http.post(f"{API_URL}/api/voice/agent{path}", json=body) as res:
                    payload = await res.json(content_type=None)
                    if res.status < 300:
                        return payload.get("data")
                    logger.error("POST %s -> %s %s", path, res.status, payload)
                    if res.status < 500:
                        return None
            except Exception:
                logger.exception("POST %s failed (attempt %d)", path, attempt + 1)
            await asyncio.sleep(0.5)
        return None

    async def close(self) -> None:
        await self._http.close()


BASE_INSTRUCTIONS = """You answer the phone for Mayells Auction House, an auction house for fine art, antiques, jewelry, watches, fashion, and design, based in Palm Beach County and New York. Speak as Mayells ("we", "our specialists"). Do not bring up that you are automated. If a caller sincerely asks whether they are speaking to a real person, never claim to be human: say you are Mayells' automated assistant and offer to have a specialist call them back.

What Mayells offers:
- Free appraisals and estate evaluations, no obligation, confidential. For a house or estate, a specialist can come to the home.
- Consignment: items are catalogued and sold through Mayells auctions at mayells.com.
- Immediate offers on quality items, and an online gallery for buyers.
- Departments: Art, Antiques and Collectibles, Luxury Goods, Fashion and Accessories, Jewelry and Watches, Design and Interiors.

Your main job is to help people who want to sell, consign, or get something appraised, and to make sure a specialist can follow up.

Taking an appraisal request:
- Ask what they have and a little about it: maker or artist, age, how many pieces, whether it is a whole estate, and any deadline such as a house sale or a move.
- Get their name, the best number to reach them, and the town where the items are. Ask for an email only if they want the photo upload link.
- If they give an email, spell it back letter by letter and have them confirm. Read the phone number back too.
- Summarise the request in one sentence and ask them to confirm, then call record_appraisal_request.
- Offer to email them a private link to upload photos, which speeds up the appraisal. Only set send_upload_link if they say yes.
- Afterwards tell them a specialist will be in touch. Never promise a specific time.

Rules:
- Never give a value, price range, or estimate over the phone, even a rough one. Say values depend on seeing the piece and the appraisal is free.
- Never quote commission rates, fees, or contract terms. A specialist covers those.
- Never invent auction dates, results, or facts about Mayells. If you do not know, offer a specialist callback.
- Record only what the caller actually said. Never guess a name, number, or email.
- This is a phone call: short sentences, one or two questions at a time, warm and unhurried, like a specialist at a top auction house.
- Buyers can browse current auctions and the gallery at mayells.com.
"""

TRANSFER_INSTRUCTIONS_OPEN = """
Transfers: a specialist is available right now. If the caller asks for a person, or has an estate, a collection, or a piece that sounds significant, offer to connect them. First take their name and number with record_appraisal_request so nothing is lost if the line drops, then say you are connecting them now, and call transfer_to_specialist."""

TRANSFER_INSTRUCTIONS_CLOSED = """
Transfers: no specialist is available to take a live call right now. If the caller asks for a person, take their details with record_appraisal_request and tell them a specialist will call them back."""


def site_instructions(site: dict | None) -> str:
    if not site:
        return "\nThe caller rang the main Mayells line."
    if site.get("serviceModel") == "local":
        where = f"Mayells serves {site['city']} directly and comes to the house for appraisals."
    else:
        where = (
            f"Mayells serves {site['city']} through scheduled visits from Palm Beach County. "
            "Do not describe it as a local office."
        )
    return f"\nThe caller rang the Mayells {site['city']} line, from the {site['city']} page. {where}"


class MayellsConcierge(Agent):
    def __init__(self, *, api: MayellsApi, call_id: str | None, site: dict | None, can_transfer: bool) -> None:
        super().__init__(
            instructions=BASE_INSTRUCTIONS
            + site_instructions(site)
            + (TRANSFER_INSTRUCTIONS_OPEN if can_transfer else TRANSFER_INSTRUCTIONS_CLOSED)
        )
        self.api = api
        self.call_id = call_id
        self.can_transfer = can_transfer
        self.caller: rtc.RemoteParticipant | None = None
        self.transferred = False

    @function_tool()
    async def record_appraisal_request(
        self,
        context: RunContext,
        name: str,
        items: str,
        phone: str | None = None,
        email: str | None = None,
        town: str | None = None,
        estimated_item_count: int | None = None,
        send_upload_link: bool = False,
    ) -> str:
        """Save the caller's appraisal or consignment request for a specialist. Call only after the caller has confirmed the details you read back.

        Args:
            name: The caller's full name as they gave it.
            items: What they have, with any maker, period, quantity, history, or deadline they mentioned.
            phone: Best callback number if they gave one different from the number they are calling from.
            email: Email address, only if they gave one and you spelled it back.
            town: Town or neighbourhood where the items are.
            estimated_item_count: Rough number of pieces, if they said.
            send_upload_link: True if they want the photo upload link emailed to them.
        """
        if not self.call_id:
            return "Saving failed. Apologise, and ask them to use the appraisal form at mayells.com or call back shortly."
        body = {
            "name": name,
            "items": items,
            "sendUploadLink": bool(send_upload_link and email),
        }
        if phone:
            body["phone"] = phone
        if email:
            body["email"] = email
        if town:
            body["town"] = town
        if estimated_item_count:
            body["estimatedItemCount"] = estimated_item_count

        result = await self.api.post(f"/calls/{self.call_id}/lead", body)
        if result is None:
            return "Saving failed. Apologise, and ask them to use the appraisal form at mayells.com or call back shortly."
        if send_upload_link and email:
            if result.get("uploadLinkEmailed"):
                return "Saved, and the upload link has been emailed. Let them know it is on its way."
            return "Saved, but the upload link email could not be sent. Tell them a specialist will send it."
        return "Saved. A specialist will follow up."

    @function_tool()
    async def transfer_to_specialist(self, context: RunContext) -> str:
        """Transfer the caller to a Mayells specialist by phone. Tell the caller you are connecting them before calling this."""
        if not self.can_transfer or not transfers_open() or self.caller is None:
            return "No specialist can take the call right now. Make sure their details are recorded and promise a callback."
        if self.caller.kind != rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            return "Transfers only work on phone calls. Offer a callback instead."
        await context.wait_for_playout()
        try:
            await agents.get_job_context().transfer_sip_participant(self.caller, f"tel:{TRANSFER_NUMBER}")
        except Exception:
            logger.exception("SIP transfer failed")
            return "The transfer did not go through. Apologise and promise a callback."
        self.transferred = True
        return "Transferred."


def transcript_of(session: AgentSession) -> list[dict]:
    turns = []
    for item in session.history.items:
        if getattr(item, "type", None) != "message" or item.role not in ("user", "assistant"):
            continue
        text = (item.text_content or "").strip()
        if text:
            turns.append({"role": "caller" if item.role == "user" else "agent", "text": text})
    return turns


server = AgentServer()


@server.rtc_session(agent_name="mayells-phone-agent")
async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    caller = await ctx.wait_for_participant()
    is_phone = caller.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP

    api = MayellsApi()
    started = await api.post(
        "/calls",
        {
            "roomName": ctx.room.name,
            "channel": "phone" if is_phone else "web",
            **({"callerNumber": caller.attributes["sip.phoneNumber"]} if caller.attributes.get("sip.phoneNumber") else {}),
            **({"calledNumber": caller.attributes["sip.trunkPhoneNumber"]} if caller.attributes.get("sip.trunkPhoneNumber") else {}),
            **({"site": caller.attributes["mayells.site"]} if caller.attributes.get("mayells.site") else {}),
        },
    )
    call_id = started.get("callId") if started else None
    site = started.get("site") if started else None

    concierge = MayellsConcierge(
        api=api,
        call_id=call_id,
        site=site,
        can_transfer=is_phone and transfers_open(),
    )
    concierge.caller = caller

    session = AgentSession(llm=xai.realtime.RealtimeModel(voice="Sal"))

    async def finish(_reason: str) -> None:
        if call_id:
            await api.post(
                f"/calls/{call_id}/end",
                {"transcript": transcript_of(session), "transferred": concierge.transferred},
            )
        await api.close()

    ctx.add_shutdown_callback(finish)

    await session.start(
        room=ctx.room,
        agent=concierge,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC(),
            ),
        ),
    )

    office = f"Mayells Auction House in {site['city']}" if site else "Mayells Auction House"
    await session.generate_reply(
        instructions=f"Answer the phone warmly in one short sentence: thank them for calling {office} and ask how you can help."
    )

    async def time_limit() -> None:
        await asyncio.sleep(MAX_CALL_MINUTES * 60)
        await session.generate_reply(
            instructions=(
                "We are out of time on this call. Politely wrap up: if their details are not yet recorded, "
                "take their name and number now; otherwise thank them and say a specialist will follow up. Then say goodbye."
            )
        )
        await asyncio.sleep(45)
        ctx.delete_room()

    limiter = asyncio.create_task(time_limit())

    async def stop_limiter(_reason: str) -> None:
        limiter.cancel()

    ctx.add_shutdown_callback(stop_limiter)


if __name__ == "__main__":
    agents.cli.run_app(server)
