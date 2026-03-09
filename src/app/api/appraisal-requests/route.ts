import { NextRequest, NextResponse } from 'next/server';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    let name: string;
    let phone: string;
    let items: string | undefined;
    let email: string | undefined;
    let service: string | undefined;
    let message: string | undefined;
    let photoAttachments: { filename: string; content: Buffer }[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      name = formData.get('name') as string;
      phone = formData.get('phone') as string;
      items = (formData.get('items') as string) || undefined;
      email = (formData.get('email') as string) || undefined;
      service = (formData.get('service') as string) || undefined;
      message = (formData.get('message') as string) || undefined;

      const photos = formData.getAll('photos') as File[];
      for (const photo of photos) {
        if (photo.size > 0) {
          const buffer = Buffer.from(await photo.arrayBuffer());
          photoAttachments.push({ filename: photo.name, content: buffer });
        }
      }
    } else {
      const body = await req.json();
      name = body.name;
      phone = body.phone;
      items = body.items;
      email = body.email;
      service = body.service;
      message = body.message;
    }

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
    }

    sendAppraisalRequestNotification(
      { name, phone, email, service, items, message },
      photoAttachments,
    ).catch((err) =>
      console.error('Failed to send appraisal notification:', err),
    );

    return NextResponse.json(
      { data: { message: 'Request submitted successfully' } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
