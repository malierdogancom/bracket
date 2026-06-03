import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';

export async function GET() {
  const db = await getDb();
  const brackets = await db.collection('brackets')
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return NextResponse.json(brackets.map(b => ({ ...b, id: b._id.toString(), _id: undefined })));
}

export async function POST(req: NextRequest) {
  if (!await verifyAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const db = await getDb();
  const result = await db.collection('brackets').insertOne({
    ...body,
    createdAt: new Date().toISOString(),
    isArchived: false,
  });
  return NextResponse.json({ id: result.insertedId.toString() });
}
