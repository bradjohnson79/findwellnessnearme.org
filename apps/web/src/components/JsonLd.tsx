export function JsonLd({ data }: { data: unknown }) {
  // Server component: inject JSON-LD without any client JS.
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}


