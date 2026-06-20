"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_LANDSCAPE_MAX_WIDTH = 960;
const MOBILE_LANDSCAPE_MAX_HEIGHT = 520;

const isMobileViewport = () => {
  const { innerWidth, innerHeight } = window;
  if (innerWidth < MOBILE_BREAKPOINT) return true;
  return (
    innerWidth <= MOBILE_LANDSCAPE_MAX_WIDTH &&
    innerHeight <= MOBILE_LANDSCAPE_MAX_HEIGHT &&
    innerWidth > innerHeight
  );
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(isMobileViewport());
    };

    checkMobile();

    window.addEventListener("resize", checkMobile);
    window.addEventListener("orientationchange", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("orientationchange", checkMobile);
    };
  }, []);

  return isMobile;
}
