import { countWords, countWordsLive, isOverWordLimit } from "@/lib/text-word-limit";

export function WordCountFooter({
  value,
  maxWords,
  overLimitHint = " — shorten to save.",
}: {
  value: string;
  maxWords: number;
  overLimitHint?: string;
}) {
  const liveCount = countWordsLive(value);
  const overLimit = isOverWordLimit(value, maxWords);

  return (
    <p
      className={`mt-1 font-montserrat text-xs ${
        overLimit ? "text-[#b42318]" : "text-[#5e5e5e]"
      }`}
    >
      {liveCount}/{maxWords} words
      {overLimit ? overLimitHint : ""}
    </p>
  );
}
