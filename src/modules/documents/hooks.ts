import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { DocumentDraftData, DocumentDTO, DocumentListItemDTO, DocumentListQuery } from '@/contracts/documents';

interface DocumentPage {
  items: DocumentListItemDTO[];
  nextCursor: string | null;
}

export type DocumentFilters = Pick<DocumentListQuery, 'kind' | 'status' | 'submissionStatus' | 'q'>;

const errorToast = (fallback: string) => (err: unknown) =>
  toast.error(err instanceof ApiClientError ? err.message : fallback);

export function useDocuments(filters: DocumentFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.documents.list(filters),
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<DocumentPage>(`/api/app/documents?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id),
    queryFn: () => apiFetch<DocumentDTO>(`/api/app/documents/${encodeURIComponent(id)}`),
    retry: (count, err) => !(err instanceof ApiClientError && err.status === 404) && count < 2,
  });
}

/** Creates when `id` is undefined, otherwise updates the draft. */
export function useSaveDocument(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentDraftData) =>
      id
        ? apiFetch<DocumentDTO>(`/api/app/documents/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
        : apiFetch<DocumentDTO>('/api/app/documents', { method: 'POST', body: input }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.documents.detail(doc.id), doc);
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
      toast.success(id ? 'Draft saved' : 'Draft created');
    },
    onError: errorToast('Could not save the draft'),
  });
}

export function useDeleteDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>(`/api/app/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: queryKeys.documents.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
      toast.success('Draft deleted');
    },
    onError: errorToast('Could not delete the draft'),
  });
}

export function useDuplicateDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<DocumentDTO>(`/api/app/documents/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.documents.detail(doc.id), doc);
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
      toast.success('Copied to a new draft');
    },
    onError: errorToast('Could not duplicate the document'),
  });
}
