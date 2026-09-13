"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket-client";

/**
 * Subscribes to live updates for the given workflow run ids over the shared
 * socket. On (re)connect it joins the rooms and immediately applies a fresh
 * DB snapshot via ack, closing the gap between a run starting and the
 * client's subscribe round-trip completing.
 */
export function useWorkflowRunUpdates<T extends { id: string }>(
  runIds: string[],
  onUpdate: (run: T) => void
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  const idsKey = runIds.join(",");

  useEffect(() => {
    if (runIds.length === 0) return;
    const socket = getSocket();
    const ids = idsKey.split(",");

    function handleUpdate(run: T) {
      if (ids.includes(run.id)) onUpdateRef.current(run);
    }

    socket.emit("subscribe:workflow-run", ids, (runs: T[]) => {
      for (const run of runs) onUpdateRef.current(run);
    });
    socket.on("workflow-run:update", handleUpdate);

    return () => {
      socket.emit("unsubscribe:workflow-run", ids);
      socket.off("workflow-run:update", handleUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
}
