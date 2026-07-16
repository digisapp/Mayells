from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import xai, noise_cancellation

load_dotenv(".env.local")


class MayellsConcierge(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are the phone concierge for Mayells, a luxury auction house specializing in fine art, antiques, jewelry, watches, fashion, and design.

Key information:
- We offer FREE appraisals and estate evaluations, no obligation, completely confidential.
- We Buy: We make immediate offers on quality items.
- We Sell: Through curated auctions and our online gallery.
- We Consign: Sellers earn top dollar through our auction process.
- Categories we handle: Art, Antiques and Collectibles, Luxury Goods, Fashion and Accessories, Jewelry and Watches, Design and Interiors.
- Our website is mayells.com where visitors can browse auctions, gallery items, and private sales.

How to help callers:
- If they want to sell or consign, offer to schedule a free appraisal or take their contact info.
- If they want to buy, mention our upcoming auctions and online gallery.
- Be warm, professional, and knowledgeable, like a specialist at a top auction house.
- Keep responses concise and conversational, this is a phone call.
- If you cannot answer something specific like exact dates or prices, offer to have a specialist call them back.""",
        )


server = AgentServer()


@server.rtc_session(agent_name="mayells-phone-agent")
async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        llm=xai.realtime.RealtimeModel(
            voice="Sal",
        ),
    )

    await session.start(
        room=ctx.room,
        agent=MayellsConcierge(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC(),
            ),
        ),
    )

    await session.generate_reply(
        instructions="Greet the caller warmly. Say something like: Hello, thank you for calling Mayells. How can I help you today?"
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
