import { prisma } from '@/lib/prisma';

/** App setting that makes two-factor authentication required for everyone. */
export const REQUIRE_TWO_FACTOR_SETTING = 'require_two_factor';

export async function getRequireTwoFactorForAll() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: REQUIRE_TWO_FACTOR_SETTING },
  });
  return setting?.value === 'true';
}

export async function setRequireTwoFactorForAll(required: boolean) {
  await prisma.appSetting.upsert({
    where: { key: REQUIRE_TWO_FACTOR_SETTING },
    create: { key: REQUIRE_TWO_FACTOR_SETTING, value: String(required) },
    update: { value: String(required) },
  });
}

/**
 * Whether a user must use two-factor: required for everyone, required for them by an
 * administrator, or required by any team they belong to.
 */
export async function isTwoFactorRequired(user: {
  id: string;
  twoFactorRequired?: boolean | null;
}) {
  if (user.twoFactorRequired) return true;

  const [forAll, strictTeam] = await Promise.all([
    getRequireTwoFactorForAll(),
    prisma.member.findFirst({
      where: { userId: user.id, organization: { twoFactorRequired: true } },
      select: { id: true },
    }),
  ]);

  return forAll || !!strictTeam;
}
