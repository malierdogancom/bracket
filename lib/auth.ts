import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const SECRET = process.env.JWT_SECRET!;

export function signToken() {
  return jwt.sign({ admin: true }, SECRET, { expiresIn: '7d' });
}

export async function verifyAuth(): Promise<boolean> {
  try {
    const store = await cookies();
    const token = store.get('auth_token')?.value;
    if (!token) return false;
    jwt.verify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}
