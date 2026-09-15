"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket-client";

/**
 * Subscribes to live task updates for the given project's board over the
 * shared socket. On (re)connect it joins the board room and immediately
 * applies a fresh DB snapshot via ack, closing the gap between a task
 * changing and the client's subscribe round-trip completing.
 */
export function useTaskUpdates<T extends { id: string }>(
  projectId: string,
  onUpdate: (task: T) => void
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket();

    function subscribe() {
      socket.emit("subscribe:board", projectId, (tasks: T[]) => {
        for (const task of tasks) onUpdateRef.current(task);
      });
    }

    function handleUpdate(task: T) {
      onUpdateRef.current(task);
    }

    subscribe();
    socket.on("task:updated", handleUpdate);
    // A reconnect (dropped transport, server restart) gets a brand new
    // server-side socket with no memory of which rooms this client had
    // joined — without rejoining here, updates silently stop flowing after
    // any reconnect even though the client believes it's still subscribed.
    socket.on("connect", subscribe);

    return () => {
      socket.emit("unsubscribe:board", projectId);
      socket.off("task:updated", handleUpdate);
      socket.off("connect", subscribe);
    };
  }, [projectId]);
}
