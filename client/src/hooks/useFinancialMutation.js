import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client.js";

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function requestFingerprint(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure request fingerprinting is unavailable in this browser.");
  }
  const data = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createIdempotencyKey() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure transaction keys are unavailable in this browser.");
  }
  return globalThis.crypto.randomUUID();
}

function storageKey(path) {
  return `bizzrow:financial-request:${path}`;
}

function readPendingRequest(path) {
  const stored = window.sessionStorage.getItem(storageKey(path));
  if (!stored) return null;
  try {
    const pending = JSON.parse(stored);
    if (typeof pending.key !== "string" || typeof pending.fingerprint !== "string") {
      throw new Error("Invalid pending request record");
    }
    return pending;
  } catch {
    throw new Error("The pending transaction key is invalid. Discard it before continuing.");
  }
}

function hasPendingRequest(path) {
  try {
    return Boolean(window.sessionStorage.getItem(storageKey(path)));
  } catch {
    return false;
  }
}

export function useFinancialMutation(path) {
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(() => hasPendingRequest(path));

  useEffect(() => {
    setPending(hasPendingRequest(path));
  }, [path]);

  const submit = useCallback(async (body) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setSubmitting(true);
    try {
      const fingerprint = await requestFingerprint(body);
      let request = readPendingRequest(path);
      if (request && request.fingerprint !== fingerprint) {
        setPending(true);
        throw new Error("A previous request is still pending. Retry with unchanged details or discard it before starting a different transaction.");
      }
      if (!request) {
        request = { key: createIdempotencyKey(), fingerprint };
        window.sessionStorage.setItem(storageKey(path), JSON.stringify(request));
      }

      const response = await api.post(path, body, {
        headers: { "Idempotency-Key": request.key },
      });
      window.sessionStorage.removeItem(storageKey(path));
      setPending(false);
      return response;
    } catch (error) {
      setPending(hasPendingRequest(path));
      throw error;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [path]);

  const abandon = useCallback(() => {
    if (inFlight.current) return false;
    try {
      window.sessionStorage.removeItem(storageKey(path));
      setPending(false);
      return true;
    } catch (error) {
      throw new Error(`Could not discard the pending transaction: ${error.message}`);
    }
  }, [path]);

  return { submit, abandon, submitting, pending };
}
