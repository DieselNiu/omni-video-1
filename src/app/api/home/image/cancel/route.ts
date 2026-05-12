import { finalizeHomeGenerationFailure } from '@/image/utils/finalize-home-generation-failure';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import {
  HOME_IMAGE_ERROR,
  HOME_IMAGE_IN_PROGRESS_STATUSES,
} from '../_lib/constants';
import { jsonNoStore } from '../_lib/http';
import { getHomeImageStatusRecord } from '../_lib/records';
import { getVerifiedGuestId } from '../_lib/request';

interface CancelRequestBody {
  jobId?: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const body = (await request
      .json()
      .catch(() => null)) as CancelRequestBody | null;
    const jobId = body?.jobId?.trim();

    if (!jobId) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.INVALID_PARAMS },
        { status: 400 }
      );
    }

    let record = null;

    if (session?.user?.id) {
      record = await getHomeImageStatusRecord({
        providerRequestId: jobId,
        userId: session.user.id,
      });
    } else {
      const guestId = await getVerifiedGuestId(request);
      if (!guestId) {
        return jsonNoStore(
          { error: HOME_IMAGE_ERROR.GUEST_COOKIE_MISSING },
          { status: 400 }
        );
      }

      record = await getHomeImageStatusRecord({
        providerRequestId: jobId,
        guestId,
      });
    }

    if (!record) {
      return jsonNoStore(
        { error: HOME_IMAGE_ERROR.RECORD_NOT_FOUND },
        { status: 404 }
      );
    }

    if (!HOME_IMAGE_IN_PROGRESS_STATUSES.includes(record.status as never)) {
      return jsonNoStore({
        success: true,
        status: record.status,
        alreadyFinal: true,
      });
    }

    await finalizeHomeGenerationFailure({
      source: record.source,
      id: record.id,
      status: 'CANCELLED',
      errorMessage: 'Generation cancelled from homepage',
    });

    return jsonNoStore({
      success: true,
      status: 'CANCELLED',
      source: record.source,
      jobId,
    });
  } catch (error) {
    console.error('[home-image.cancel] error:', error);
    return jsonNoStore({ error: 'Internal server error' }, { status: 500 });
  }
}
