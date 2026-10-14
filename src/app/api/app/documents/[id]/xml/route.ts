import { documentsService } from '@/server/documents/documents.service';
import { jsonError, requireBusinessContext } from '@/server/common/http';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireBusinessContext();
    const { id } = await params;
    const { number, xml } = await documentsService.getXml(businessId, id);
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${number}.xml"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
