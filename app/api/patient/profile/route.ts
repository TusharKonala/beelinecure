import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  PATIENT_ADDRESS_MAX_WORDS,
  withinWordLimitRefine,
  wordLimitErrorMessage,
} from "@/lib/text-word-limit";

const updateSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number")
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .max(500)
    .optional()
    .or(z.literal(""))
    .refine(withinWordLimitRefine(PATIENT_ADDRESS_MAX_WORDS), {
      message: wordLimitErrorMessage(
        "Address",
        PATIENT_ADDRESS_MAX_WORDS,
      ),
    }),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.PATIENT) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      phone: true,
      address: true,
      password: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    hasPassword: Boolean(user.password),
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== UserRole.PATIENT) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name.trim(),
      phone: parsed.data.phone?.trim() || null,
      address: parsed.data.address?.trim() || null,
    },
    select: { name: true, email: true, phone: true, address: true },
  });
  return NextResponse.json(updated);
}
