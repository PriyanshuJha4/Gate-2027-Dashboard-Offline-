import BackupRestoreSettings from "@/components/BackupRestoreSettings";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-16">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings & Backup</h1>
      <BackupRestoreSettings />
    </div>
  );
}
