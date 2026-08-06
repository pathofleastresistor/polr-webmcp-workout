import { eq } from "drizzle-orm";
import { Form, redirect, useNavigation } from "react-router";

import { AppShell } from "~/components/AppShell";
import { userProfile } from "~/db/schema";
import { updateProfileInput } from "~/domain/contracts";
import { getAppContext } from "~/server/context";
import { requireUser } from "~/server/session.server";
import { useAccountTools } from "~/webmcp/tools/useAccountTools";

import type { Route } from "./+types/settings";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Settings — Spotter" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return {
    demoMode: getAppContext(context).config.demoMode,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      unitSystem: user.profile.unitSystem,
      experienceLevel: user.profile.experienceLevel,
      goal: user.profile.goal,
      timezone: user.profile.timezone,
      weeklyTargetSessions: user.profile.weeklyTargetSessions,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const { db, auth } = getAppContext(context);

  const formData = await request.formData();

  if (formData.get("intent") === "sign-out") {
    // Better Auth revokes the session row and returns the cookie-clearing
    // headers; forwarding its response is what actually signs the person out.
    const response = await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    });
    return redirect("/", { headers: response.headers });
  }

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
  const { profile, demoMode } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  useAccountTools();

  return (
    <AppShell user={profile} demoMode={demoMode}>
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-slate-400">
        These preferences shape what your agent suggests, so it is worth keeping
        them accurate.
      </p>

      <Form method="post" className="mt-8 max-w-lg space-y-6">
        <Field label="Units" hint="How weights are shown to you.">
          <select
            name="unitSystem"
            defaultValue={profile.unitSystem}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
          >
            <option value="metric">Kilograms</option>
            <option value="imperial">Pounds</option>
          </select>
        </Field>

        <Field
          label="Experience"
          hint="Your agent uses this to pick sensible starting loads and volume."
        >
          <select
            name="experienceLevel"
            defaultValue={profile.experienceLevel}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>

        <Field
          label="Sessions per week"
          hint="What your streak is measured against."
        >
          <input
            type="number"
            name="weeklyTargetSessions"
            min={1}
            max={14}
            defaultValue={profile.weeklyTargetSessions}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
          />
        </Field>

        <Field
          label="Training goal"
          hint="A sentence in your own words. Your agent reads this before programming."
        >
          <textarea
            name="goal"
            rows={3}
            maxLength={280}
            defaultValue={profile.goal ?? ""}
            placeholder="Get back to a 100 kg bench without aggravating my shoulder."
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
          />
        </Field>

        {actionData?.error && (
          <p role="alert" className="text-sm text-rose-300">
            {actionData.error}
          </p>
        )}
        {actionData && "saved" in actionData && actionData.saved && (
          <p role="status" className="text-sm text-emerald-300">
            Saved.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </Form>
    </AppShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
