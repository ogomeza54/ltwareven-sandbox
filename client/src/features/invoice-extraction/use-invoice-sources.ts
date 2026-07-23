import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import type {
  InvoiceDraftDto,
  InvoicePublicAssetDto,
} from "@shared/invoice-extraction/contracts";
import {
  createInvoiceDraft,
  deleteInvoiceSource,
  getInvoiceDraft,
  invoiceFileChecksum,
  listInvoiceDrafts,
  movedInvoiceAssetIds,
  reorderInvoiceSources,
  SerializedInvoiceMutationQueue,
  selectResumableInvoiceDraft,
  safeInvoiceDisplayName,
  uploadInvoiceSource,
} from "./invoice-source-api";

export function useInvoiceSources(open: boolean) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<InvoiceDraftDto | null>(null);
  const draftRef = useRef<InvoiceDraftDto | null>(null);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mutationCount, setMutationCount] = useState(0);
  const mutationToken = useRef<symbol | null>(null);
  const tenantRef = useRef(companyId);
  if (tenantRef.current !== companyId) tenantRef.current = companyId;
  const operationQueue = useRef(new SerializedInvoiceMutationQueue());
  const queryKey = ["invoice-drafts-for-receiving", companyId] as const;
  const drafts = useQuery({
    queryKey,
    queryFn: async () => {
      const listed = await listInvoiceDrafts();
      const resumable = selectResumableInvoiceDraft(listed);
      return resumable ? getInvoiceDraft(resumable.id) : null;
    },
    enabled: open && !!companyId,
    staleTime: 0,
  });

  const updateDraft = (
    next: InvoiceDraftDto,
    expectedTenant = tenantRef.current,
  ): boolean => {
    if (expectedTenant !== tenantRef.current) return false;
    if (
      draftRef.current?.id === next.id &&
      next.revision < draftRef.current.revision
    ) {
      return false;
    }
    draftRef.current = next;
    setDraft(next);
    queryClient.setQueryData(queryKey, next);
    return true;
  };

  useEffect(() => {
    draftRef.current = null;
    setDraft(null);
    setError(null);
    setStatus(null);
    setUploadingNames([]);
    setMutationCount(0);
    mutationToken.current = null;
    operationQueue.current = new SerializedInvoiceMutationQueue();
  }, [companyId]);

  useEffect(() => {
    if (!open || mutationCount > 0 || !drafts.data) return;
    updateDraft(drafts.data);
  }, [drafts.data, mutationCount, open]);

  const runMutation = async <T>(
    operation: () => Promise<T>,
    whenBusy: T,
  ): Promise<T> => {
    if (mutationToken.current) {
      setError("Another invoice source operation is still in progress.");
      return whenBusy;
    }
    const token = Symbol("invoice-source-mutation");
    mutationToken.current = token;
    setMutationCount((count) => count + 1);
    try {
      return await operationQueue.current.run(operation);
    } finally {
      if (mutationToken.current === token) {
        mutationToken.current = null;
        setMutationCount((count) => Math.max(0, count - 1));
      }
    }
  };

  const upload = async (
    file: File,
    replacementAsset?: InvoicePublicAssetDto,
  ): Promise<InvoicePublicAssetDto | null> =>
    runMutation(async () => {
    const operationTenant = tenantRef.current;
    setError(null);
    setStatus(null);
    if (drafts.isLoading) {
      setError("Please wait while saved invoice sources are restored.");
      return null;
    }
    if (drafts.isError) {
      setError(
        drafts.error instanceof Error
          ? drafts.error.message
          : "Saved invoice sources could not be restored.",
      );
      return null;
    }
    if (file.size > 10_485_760) {
      setError("Each invoice file must be 10 MiB or smaller.");
      return null;
    }
    try {
      let current: InvoiceDraftDto;
      try {
        current = draftRef.current ?? (await createInvoiceDraft());
        if (!updateDraft(current, operationTenant)) return null;
      } catch (caught) {
        try {
          const recovered = selectResumableInvoiceDraft(
            await listInvoiceDrafts(),
          );
          if (!recovered) throw caught;
          current = await getInvoiceDraft(recovered.id);
          if (!updateDraft(current, operationTenant)) return null;
        } catch {
          setError(
            caught instanceof Error
              ? caught.message
              : "The invoice draft could not be created.",
          );
          return null;
        }
      }
      const displayName = safeInvoiceDisplayName(file.name);
      const checksumSha256 = await invoiceFileChecksum(file).catch(() => null);
      const beforeIds = new Set(current.source?.assets.map((asset) => asset.id));
      const matchesFile = (asset: InvoicePublicAssetDto): boolean =>
        checksumSha256 !== null &&
        asset.checksumSha256 === checksumSha256;
      setUploadingNames((names) => [...names, displayName]);
      try {
        current = await uploadInvoiceSource(
          current,
          file,
          replacementAsset?.id,
        );
        if (!updateDraft(current, operationTenant)) return null;
        const savedAsset =
          current.source?.assets.find((asset) => !beforeIds.has(asset.id)) ??
          current.source?.assets.find(matchesFile) ??
          null;
        setStatus(`${displayName} saved.`);
        return savedAsset;
      } catch (caught) {
        try {
          const recovered = await getInvoiceDraft(current.id);
          if (!updateDraft(recovered, operationTenant)) return null;
          const recoveredAsset =
            recovered.source?.assets.find(
              (asset) =>
                !beforeIds.has(asset.id) &&
                matchesFile(asset) &&
                (!replacementAsset ||
                  !recovered.source?.assets.some(
                    (item) => item.id === replacementAsset.id,
                  )),
            ) ?? null;
          if (recoveredAsset) {
            setStatus(`${displayName} saved after reconnecting.`);
            return recoveredAsset;
          }
        } catch {
          // The original File remains in the preview for an explicit retry.
        }
        setError(
          `${caught instanceof Error ? caught.message : "The invoice source could not be saved."} The file is still available; choose Retry upload.`,
        );
        return null;
      } finally {
        setUploadingNames((names) => {
          const index = names.indexOf(displayName);
          return index < 0
            ? names
            : [...names.slice(0, index), ...names.slice(index + 1)];
        });
      }
    } finally {
      // Serialization owns mutation ordering; no optimistic server state is used.
    }
  }, null);

  const remove = async (asset: InvoicePublicAssetDto): Promise<boolean> =>
    runMutation(async () => {
    const operationTenant = tenantRef.current;
    const currentDraft = draftRef.current;
    if (!currentDraft) return false;
    setError(null);
    setStatus(null);
    try {
      const current = await deleteInvoiceSource(currentDraft, asset);
      if (!updateDraft(current, operationTenant)) return false;
      setStatus(`${asset.displayName} removed.`);
      return true;
    } catch (caught) {
      try {
        const recovered = await getInvoiceDraft(currentDraft.id);
        if (!updateDraft(recovered, operationTenant)) return false;
        if (!recovered.source?.assets.some((item) => item.id === asset.id)) {
          setStatus(`${asset.displayName} removed after reconnecting.`);
          return true;
        }
      } catch {
        // Preserve the mutation error if authoritative refresh is unavailable.
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The invoice source could not be removed.",
      );
      return false;
    }
  }, false);

  const move = async (
    asset: InvoicePublicAssetDto,
    direction: -1 | 1,
  ): Promise<boolean> =>
    runMutation(async () => {
      const operationTenant = tenantRef.current;
      const currentDraft = draftRef.current;
      if (!currentDraft?.source) return false;
      setError(null);
      setStatus(null);
      const orderedIds = movedInvoiceAssetIds(
        currentDraft.source.assets,
        asset.id,
        direction,
      );
      if (!orderedIds) return false;
      const target = orderedIds.indexOf(asset.id);
      try {
        const current = await reorderInvoiceSources(
          currentDraft,
          orderedIds,
        );
        if (!updateDraft(current, operationTenant)) return false;
        setStatus(
          `${asset.displayName} moved to position ${target + 1} of ${orderedIds.length}.`,
        );
        return true;
      } catch (caught) {
        let restored = false;
        try {
          const recovered = await getInvoiceDraft(currentDraft.id);
          if (!updateDraft(recovered, operationTenant)) return false;
          const recoveredIds =
            recovered.source?.assets
              .slice()
              .sort(
                (left, right) =>
                  (left.position ?? 0) - (right.position ?? 0),
              )
              .map((item) => item.id) ?? [];
          if (
            recoveredIds.length === orderedIds.length &&
            recoveredIds.every((id, index) => id === orderedIds[index])
          ) {
            setStatus(
              `${asset.displayName} moved to position ${target + 1} of ${orderedIds.length} after reconnecting.`,
            );
            return true;
          }
          restored = true;
        } catch {
          // Keep the conflict actionable when authoritative refresh is unavailable.
        }
        setError(
          `${caught instanceof Error ? caught.message : "The invoice source order could not be saved."} ${
            restored
              ? "Server order has been restored; try again."
              : "Refresh the invoice before trying again."
          }`,
        );
        return false;
      }
    }, false);

  return {
    draft,
    assets: draft?.source?.assets ?? [],
    uploadingNames,
    status,
    error:
      error ??
      (drafts.isError
        ? drafts.error instanceof Error
          ? drafts.error.message
          : "Saved invoice sources could not be restored."
        : null),
    loading: drafts.isLoading,
    mutating: uploadingNames.length > 0 || mutationCount > 0,
    busy:
      drafts.isLoading || uploadingNames.length > 0 || mutationCount > 0,
    upload,
    remove,
    move,
  };
}
