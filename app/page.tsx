import { MuseStreamPanel } from '@/components/muse-stream-panel';

export default function HomePage() {
  return (
    <main className="page">
      <section className="card">
        <h1>Muse Live Stream</h1>
        <p>
          Connect to a Muse headset over Web Bluetooth and stream samples through the
          <code> BCIDevice </code>
          client.
        </p>
        <MuseStreamPanel />
      </section>
    </main>
  );
}
