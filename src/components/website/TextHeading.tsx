export function TextHeading({
  text,
  emphasis,
}: {
  text: string;
  emphasis: string;
}) {
  const index = emphasis ? text.indexOf(emphasis) : -1;
  return index < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, index)}
      <em>{emphasis}</em>
      {text.slice(index + emphasis.length)}
    </>
  );
}
