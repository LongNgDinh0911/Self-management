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

    function subscribe() {
      socket.emit("subscribe:workflow-run", ids, (runs: T[]) => {
        for (const run of runs) onUpdateRef.current(run);
      });
    }

    function handleUpdate(run: T) {
      if (ids.includes(run.id)) onUpdateRef.current(run);
    }

    subscribe();
    socket.on("workflow-run:update", handleUpdate);
    // A reconnect (dropped transport, server restart) gets a brand new
    // server-side socket with no memory of which rooms this client had
    // joined — without rejoining here, updates silently stop flowing after
    // any reconnect even though the client believes it's still subscribed.
    socket.on("connect", subscribe);

    return () => {
      socket.emit("unsubscribe:workflow-run", ids);
      socket.off("workflow-run:update", handleUpdate);
      socket.off("connect", subscribe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
}
