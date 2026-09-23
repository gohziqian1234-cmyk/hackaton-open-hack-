import { Empty, Button } from '../components/ui';
export default function NotFound() {
  return (
    <section className="wrap page-pad">
      <Empty
        heading="h1"
        title="We couldn’t find that page."
        action={<Button href="/">Back to LoopBox</Button>}
      >
        The link may be old, or the drop may have moved.
      </Empty>
    </section>
  );
}
