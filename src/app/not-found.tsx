import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="page empty">
      <p className="eyebrow">A LITTLE OFF ORBIT</p>
      <h1>
        This corner of the universe
        <br />
        hasn’t been discovered.
      </h1>
      <Link className="button primary" href="/">
        Back to LoopBox
      </Link>
    </section>
  );
}
