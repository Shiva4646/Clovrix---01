import Settings from '../Settings';

export default function SettingsPage({ initialTab }: { initialTab?: string }) {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Settings initialTab={initialTab} />
    </div>
  );
}
