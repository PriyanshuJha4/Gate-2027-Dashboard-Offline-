// Backwards-compatible view of lib/topics.ts. Keeps the spelling already stored in
// cards.topic / pdfs.chapter / error_logs.topic so nothing else has to change.
import { topicsBySubject } from "@/lib/topics";

export interface SubjectSyllabus {
  subject: string;
  topics: string[];
}

export const GATE_SYLLABUS: SubjectSyllabus[] = topicsBySubject().map((g) => ({
  subject: g.subject,
  topics: g.topics.map((t) => t.libName),
}));
