"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Phones and tablets show toasts at the top, where the header is: at the
// bottom they covered submit buttons and the chat composer, and on iOS they
// hide behind the keyboard while an input is focused. Desktop keeps the
// caller's position (bottom-right). Same 1024px split as --mobile-cta-bar.
const TOUCH_LAYOUT = "(max-width: 1023.98px)"

function subscribeTouchLayout(onChange: () => void) {
  const mq = window.matchMedia(TOUCH_LAYOUT)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function useTouchLayout() {
  return useSyncExternalStore(
    subscribeTouchLayout,
    () => window.matchMedia(TOUCH_LAYOUT).matches,
    () => false
  )
}

// sonner's stock offsets (24px, 16px under 600px) ignore the status bar in a
// home-screen app, the landscape notch and sticky bottom action bars. Top: a
// banner just under the status bar / notch. Bottom (desktop, or a caller
// asking for it): clear a sticky bar (--mobile-cta-bar already includes the
// home-indicator inset) or else the home indicator, whichever is higher;
// --mobile-cta-bar is 0 on desktop, where this is the stock 24px.
const OFFSET: ToasterProps["offset"] = {
  top: "calc(12px + env(safe-area-inset-top))",
  right: "calc(24px + env(safe-area-inset-right))",
  bottom: "max(calc(var(--mobile-cta-bar, 0px) + 24px), max(24px, env(safe-area-inset-bottom)))",
  left: "calc(24px + env(safe-area-inset-left))",
}
const MOBILE_OFFSET: ToasterProps["mobileOffset"] = {
  top: "calc(12px + env(safe-area-inset-top))",
  right: "16px",
  bottom: "max(calc(var(--mobile-cta-bar, 0px) + 16px), max(16px, env(safe-area-inset-bottom)))",
  left: "16px",
}

const Toaster = ({ position = "bottom-right", ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const touch = useTouchLayout()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={touch ? "top-center" : position}
      offset={OFFSET}
      mobileOffset={MOBILE_OFFSET}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
