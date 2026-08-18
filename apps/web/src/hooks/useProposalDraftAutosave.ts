"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useProposalDraftMutations } from "@/hooks/useProposalDrafts";
import type { ProposalDraft } from "@/services/graphql/types/proposal-drafts";
import {
  PROPOSAL_DRAFT_PAYLOAD_VERSION,
  parseProposalDraftDocument,
  proposalDraftTitle,
  serializeProposalDraftDocument,
} from "@/utils/proposal-draft-document";
import type { ProposalDraftDocument } from "@/utils/proposal-draft-document";

export type ProposalDraftSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

const AUTOSAVE_DELAY_MS = 1_500;

const newClientRequestID = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const errorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object"
  ) {
    const response = error.response as { errors?: { message?: string }[] };
    if (response.errors?.[0]?.message) return response.errors[0].message;
  }
  return error instanceof Error ? error.message : String(error);
};

export function useProposalDraftAutosave({
  daoCode,
  document,
  enabled,
  meaningful,
  initialDraft,
  onSaved,
}: {
  daoCode: string;
  document: ProposalDraftDocument;
  enabled: boolean;
  meaningful: boolean;
  initialDraft?: ProposalDraft;
  onSaved: (payload: string) => void;
}) {
  const { save, remove } = useProposalDraftMutations(daoCode);
  const saveDraft = save.mutateAsync;
  const deleteDraft = remove.mutateAsync;
  const [status, setStatus] = useState<ProposalDraftSaveStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [currentRevision, setCurrentRevision] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>(initialDraft?.id);
  const [queueTick, setQueueTick] = useState(0);
  const draftIdRef = useRef<string | undefined>(initialDraft?.id);
  const revisionRef = useRef<number | undefined>(initialDraft?.revision);
  const clientRequestIDRef = useRef(newClientRequestID());
  const lastSavedPayloadRef = useRef(
    initialDraft ? serializeProposalDraftDocument(document) : ""
  );
  const latestDocumentRef = useRef(document);
  const pendingPayloadRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const pausedRef = useRef(false);
  const conflictedRef = useRef(false);
  const mountedRef = useRef(true);
  const shouldPersist = meaningful || Boolean(draftId);

  useEffect(() => {
    latestDocumentRef.current = document;
  }, [document]);

  const processQueue = useCallback(() => {
    if (inFlightRef.current || pausedRef.current) return;
    const generation = generationRef.current;

    const run = async () => {
      while (
        mountedRef.current &&
        generation === generationRef.current &&
        pendingPayloadRef.current &&
        !pausedRef.current
      ) {
        const payload = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        setStatus("saving");
        setLastError(null);
        try {
          const queuedDocument = parseProposalDraftDocument(
            payload,
            PROPOSAL_DRAFT_PAYLOAD_VERSION
          );
          const saved = await saveDraft({
            daoCode,
            draftId: draftIdRef.current,
            clientRequestId: clientRequestIDRef.current,
            title: proposalDraftTitle(queuedDocument.actions),
            payload,
            payloadVersion: PROPOSAL_DRAFT_PAYLOAD_VERSION,
            revision: revisionRef.current,
          });
          if (!mountedRef.current || generation !== generationRef.current) {
            return;
          }
          draftIdRef.current = saved.id;
          setDraftId(saved.id);
          revisionRef.current = saved.revision;
          lastSavedPayloadRef.current = payload;
          setStatus("saved");
          onSaved(payload);
        } catch (error) {
          if (!mountedRef.current || generation !== generationRef.current) {
            return;
          }
          const message = errorMessage(error);
          const revisionMatch = message.match(
            /draft_revision_conflict:current_revision=(\d+)/
          );
          if (revisionMatch) {
            pausedRef.current = true;
            conflictedRef.current = true;
            setCurrentRevision(Number(revisionMatch[1]));
            setStatus("conflict");
          } else {
            setLastError(message);
            setStatus("error");
          }
          pendingPayloadRef.current = null;
          return;
        }
      }
    };

    const promise = run().finally(() => {
      if (inFlightRef.current === promise) {
        inFlightRef.current = null;
      }
      if (
        mountedRef.current &&
        pendingPayloadRef.current &&
        !pausedRef.current
      ) {
        setQueueTick((value) => value + 1);
      }
    });
    inFlightRef.current = promise;
  }, [daoCode, onSaved, saveDraft]);

  const enqueueCurrent = useCallback(() => {
    if (!enabled || !shouldPersist || pausedRef.current) return;
    let payload: string;
    try {
      payload = serializeProposalDraftDocument(latestDocumentRef.current);
    } catch (error) {
      setLastError(errorMessage(error));
      setStatus("error");
      return;
    }
    if (payload === lastSavedPayloadRef.current) {
      setStatus("saved");
      return;
    }
    pendingPayloadRef.current = payload;
    setQueueTick((value) => value + 1);
  }, [enabled, shouldPersist]);

  useEffect(() => {
    if (!enabled || !shouldPersist || pausedRef.current) return;
    let payload: string;
    try {
      payload = serializeProposalDraftDocument(document);
    } catch (error) {
      setLastError(errorMessage(error));
      setStatus("error");
      return;
    }
    if (payload === lastSavedPayloadRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(() => {
      pendingPayloadRef.current = payload;
      setQueueTick((value) => value + 1);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [document, enabled, shouldPersist]);

  useEffect(() => {
    if (queueTick > 0) processQueue();
  }, [processQueue, queueTick]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingPayloadRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const retry = useCallback(() => {
    pausedRef.current = false;
    conflictedRef.current = false;
    setCurrentRevision(null);
    enqueueCurrent();
  }, [enqueueCurrent]);

  const saveAsNew = useCallback(() => {
    pausedRef.current = false;
    conflictedRef.current = false;
    draftIdRef.current = undefined;
    setDraftId(undefined);
    revisionRef.current = undefined;
    clientRequestIDRef.current = newClientRequestID();
    lastSavedPayloadRef.current = "";
    setCurrentRevision(null);
    enqueueCurrent();
  }, [enqueueCurrent]);

  const stopAndDelete = useCallback(async () => {
    if (conflictedRef.current) {
      throw new Error("draft_cleanup_skipped_conflict");
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingPayloadRef.current = null;
    if (inFlightRef.current) await inFlightRef.current;
    generationRef.current += 1;
    pausedRef.current = true;
    const draftId = draftIdRef.current;
    if (!draftId) return;
    await deleteDraft({ daoCode, draftId });
    draftIdRef.current = undefined;
    setDraftId(undefined);
  }, [daoCode, deleteDraft]);

  return {
    status,
    lastError,
    currentRevision,
    retry,
    saveAsNew,
    stopAndDelete,
    draftId,
  };
}
