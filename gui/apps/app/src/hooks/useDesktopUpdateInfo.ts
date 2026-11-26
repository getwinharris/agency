import { useEffect, useState } from "react";
import type { RoomDesktopApi, RoomDesktopInfo } from "@cloudroom/desktop-contract";
import { getRoomDesktopInfo } from "@/lib/room-desktop";

interface DesktopUpdateInfo {
  desktopApi: RoomDesktopApi | null;
  desktopInfo: RoomDesktopInfo | null;
  isDesktop: boolean;
}

export const DESKTOP_DOWNLOAD_URL = "https://github.com/getwinharris/agency/releases";

export function useDesktopUpdateInfo(): DesktopUpdateInfo {
  const [desktopApi] = useState<RoomDesktopApi | null>(() => getRoomDesktopInfo());
  const [desktopInfo, setDesktopInfo] = useState<RoomDesktopInfo | null>(null);

  useEffect(() => {
    if (desktopApi === null) {
      return;
    }

    let mounted = true;
    void desktopApi
      .getInfo()
      .then((info) => {
        if (mounted) {
          setDesktopInfo(info);
        }
      })
      .catch(() => undefined);
    const unsubscribe = desktopApi.onChange((info) => {
      setDesktopInfo(info);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [desktopApi]);

  return {
    desktopApi,
    desktopInfo,
    isDesktop: desktopApi !== null,
  };
}
