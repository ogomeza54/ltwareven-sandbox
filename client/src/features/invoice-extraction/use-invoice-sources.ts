import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  InvoiceDraftDto,
  InvoicePublicAssetDto,
} from "@shared/invoice-extraction/contracts";
import {
  createInvoiceDraft,
  deleteInvoiceSource,
  getInvoiceDraft,
  listInvoiceDrafts,
  selectResumableInvoiceDraft,
  safeInvoiceDisplayName,
  uploadInvoiceSource,
} from "./invoice-source-api";

export function useInvoiceSources(open: boolean) {
  const [draft, setDraft] = useState<InvoiceDraftDto | null>(null);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const uploadActive = useRef(false);
  const drafts = useQuery({
    queryKey: ["invoice-drafts-for-receiving"],
    queryFn: async () => {
      const listed = await listInvoiceDrafts();
      const resumable = selectResumableInvoiceDraft(listed);
      return resumable ? getInvoiceDraft(resumable.id) : null;
    },
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open || draft || !drafts.data) return;
    setDraft(drafts.data);
  }, [draft, drafts.data, open]);

  const upload = async (files: readonly File[]): Promise<void> => {
    if (uploadActive.current) return;
    setError(null);
    if (drafts.isLoading) {
      setError("Please wait while saved invoice sources are restored.");
      return;
    }
    if (drafts.isError) {
      setError(
        drafts.error instanceof Error
          ? drafts.error.message
          : "Saved invoice sources could not be restored.",
      );
      return;
    }
    const oversized = files.find((file) => file.size > 10_485_760);
    if (oversized) {
      setError("Each invoice file must be 10 MiB or smaller.");
      return;
    }
    uploadActive.current = true;
    try {
      let current: InvoiceDraftDto;
      try {
        current = draft ?? (await createInvoiceDraft());
        setDraft(current);
      } catch (caught) {
        try {
          const recovered = selectResumableInvoiceDraft(
            await listInvoiceDrafts(),
          );
          if (!recovered) throw caught;
          current = await getInvoiceDraft(recovered.id);
          setDraft(current);
        } catch {
          setError(
            caught instanceof Error
              ? caught.message
              : "The invoice draft could not be created.",
          );
          return;
        }
      }
      for (const file of files) {
        const displayName = safeInvoiceDisplayName(file.name);
        setUploadingNames((names) => [...names, displayName]);
        try {
        current = await uploadInvoiceSource(current, file);
        setDraft(current);
        } catch (caught) {
          try {
            current = await getInvoiceDraft(current.id);
            setDraft(current);
          } catch {
            // Keep the actionable mutation error when refresh is unavailable.
          }
          setError(
            caught instanceof Error
              ? caught.message
              : "The invoice source could not be saved.",
          );
          break;
        } finally {
          setUploadingNames((names) => {
            const index = names.indexOf(displayName);
            return index < 0
              ? names
              : [...names.slice(0, index), ...names.slice(index + 1)];
          });
        }
      }
    } finally {
      uploadActive.current = false;
    }
  };

  const remove = async (asset: InvoicePublicAssetDto): Promise<void> => {
    if (!draft) return;
    setError(null);
    try {
      const current = await deleteInvoiceSource(draft, asset);
      setDraft(current);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The invoice source could not be removed.",
      );
    }
  };

  return {
    draft,
    assets: draft?.source?.assets ?? [],
    uploadingNames,
    error:
      error ??
      (drafts.isError
        ? drafts.error instanceof Error
          ? drafts.error.message
          : "Saved invoice sources could not be restored."
        : null),
    loading: drafts.isLoading,
    busy: drafts.isLoading || uploadingNames.length > 0,
    upload,
    remove,
  };
}
