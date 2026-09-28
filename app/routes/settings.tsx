import { eq } from "drizzle-orm";
import { Form, useNavigation } from "react-router";

import { AppShell } from "~/components/AppShell";
import { PrivateLink } from "~/components/PrivateLink";
import { userProfile } from "~/db/schema";
import { updateProfileInput } from "~/domain/contracts";
import { requireUser } from "~/server/access.server";
import { getAppContext } from "~/server/context";
import { useAccountTools } from "~/webmcp/tools/useAccountTools";

import type { Route } from "./+types/settings";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Settings · Spotter" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { config } = getAppContext(context);
  return {
    url: `${config.appUrl}/w/${params.key}`,
    profile: user.profile,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const { db } = getAppContext(context);

  const formData = await request.formData();

  const parsed = updateProfileInput.safeParse({
    unitSystem: formData.get("unitSystem") ?? undefined,
    experienceLevel: formData.get("experienceLevel") ?? undefined,
    goal: formData.get("goal") ?? undefined,
    weeklyTargetSessions: formData.get("weeklyTargetSessions")
      ? Number(formData.get("weeklyTargetSessions"))
      : undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }

  await db
    .update(userProfile)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(userProfile.userId, user.id));

  return { error: null, saved: true };
}

export default function Settings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { url, profile } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  useAccountTools();

  return (
    <AppShell>
      <h1 className="display">Settings</h1>
      <p className="mt-2 text-ink-muted">
        Your agent reads these before it plans anything.
      </p>

      <Form method="post" className="mt-8 grid max-w-sm gap-6">
        <Field label="Units" name="unitSystem">
          <select
            id="unitSystem"
            name="unitSystem"
            defaultValue={profile.unitSystem}
            className="input"
          >
            <option value="metric">Kilograms</option>
            <option value="imperial">Pounds</option>
          </select>
        </Field>

        <Field
          label="Experience"
          name="experienceLevel"
          hint="Used to pick starting loads and volume."
        >
          <select
            id="experienceLevel"
            name="experienceLevel"
            defaultValue={profile.experienceLevel}
            className="input"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>

        <Field label="Workouts per week" name="weeklyTargetSessions">
          <input
            id="weeklyTargetSessions"
            type="number"
            name="weeklyTargetSessions"
            min={1}
            max={14}
            defaultValue={profile.weeklyTargetSessions}
            className="input"
          />
        </Field>

        <Field label="Goal" name="goal" hint="A sentence in your own words.">
          <textarea
            id="goal"
            name="goal"
            rows={3}
            maxLength={280}
            defaultValue={profile.goal ?? ""}
            placeholder="Get back to a 100 kg bench without hurting my shoulder."
            className="input"
          />
        </Field>

        {actionData?.error && (
          <p role="alert" className="caption text-danger">
            Couldn&apos;t save: {actionData.error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save settings"}
          </button>
          {actionData && "saved" in actionData && actionData.saved && (
            <span role="status" className="caption text-brand-text">
              Saved
            </span>
          )}
        </div>
      </Form>

      <div className="mt-12 max-w-2xl">
        <PrivateLink url={url} title="Your link">
          This is your account. Keep it bookmarked and don&apos;t share it:
          anyone who has it can see and change your workouts.
        </PrivateLink>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  name,
  hint,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="caption">{hint}</p>}
    </div>
  );
}
