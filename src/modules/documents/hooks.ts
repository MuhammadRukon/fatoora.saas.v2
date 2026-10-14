import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError, errorToast } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { DocumentDraftData, DocumentDTO, DocumentListItemDTO, DocumentListQuery } from '@/contracts/documents';
import type { CursorPage } from '@/server/common/pagination';

type DocumentFilters = Pick<DocumentListQuery, 'kind' | 'status' | 'submissionStatus' | 'q'>;

export function useDocuments(filters: DocumentFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.documents.list(filters),
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<CursorPage<DocumentListItemDTO>>(`/api/app/documents?${params}`);
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
      void qc.invalidateQueries({ queryKey: queryKeys.documents.lists }); // the detail was just set
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
      void qc.invalidateQueries({ queryKey: queryKeys.documents.lists }); // the detail was just set
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
      void qc.invalidateQueries({ queryKey: queryKeys.documents.lists }); // the detail was just set
      toast.success('Copied to a new draft');
    },
    onError: errorToast('Could not duplicate the document'),
  });
}

const verdictToast = (doc: DocumentDTO) => {
  if (doc.submissionStatus === 'REJECTED') toast.error(`${doc.number} was rejected by ZATCA`);
  else if (doc.submissionStatus === 'PENDING_RETRY') toast.warning(`${doc.number} is issued but not yet reported to ZATCA`);
  else toast.success(`${doc.number} ${doc.submissionStatus === 'CLEARED' ? 'cleared' : 'reported'}`);
};

/** Issue then submit: HTTP 200 carries ZATCA's verdict in `submissionStatus`, even for a rejection. */
function useDocumentAction(id: string, action: 'issue' | 'retry', failure: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<DocumentDTO>(`/api/app/documents/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.documents.detail(doc.id), doc);
      void qc.invalidateQueries({ queryKey: queryKeys.documents.lists }); // the detail was just set
      verdictToast(doc);
    },
    onError: errorToast(failure),
  });
}

export const useIssueDocument = (id: string) => useDocumentAction(id, 'issue', 'Could not issue the document');
export const useRetryDocument = (id: string) => useDocumentAction(id, 'retry', 'Could not resubmit the document');
