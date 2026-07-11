import SettingsForm from "../components/SettingsForm";
import { getApiKeysStatus } from "../actions/settings";
import { getFreeTrialStatus } from "../actions/chat";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const apiKeysStatus = await getApiKeysStatus();
  const trialStatus = await getFreeTrialStatus();

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8 bg-zinc-950">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-100 bg-gradient-to-r from-violet-400 to-pink-500 bg-clip-text text-transparent">
            Settings & API Keys
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Configure private credentials to power conversations. Keys are AES-256-GCM encrypted.
          </p>
        </div>
        <SettingsForm initialKeys={apiKeysStatus} trialStatus={trialStatus} />
      </div>
    </div>
  );
}
