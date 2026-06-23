import { countChars, isOverCharLimit } from "@/lib/text-char-limit";

export function CharCountFooter({
  value,
  maxChars,
  overLimitHint = " — shorten to save.",
}: {
  value: string;
  maxChars: number;
  overLimitHint?: string;
}) {
  const count = countChars(value);
  const overLimit = isOverCharLimit(value, maxChars);

  return (
    <p
      className={`mt-1 font-montserrat text-xs ${
        overLimit ? "text-[#b42318]" : "text-[#5e5e5e]"
      }`}
    >
      {count}/{maxChars} characters
      {overLimit ? overLimitHint : ""}
    </p>
  );
}
