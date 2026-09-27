// Speech bubbles and turn summaries: one plain line (<= 80 chars, word boundary), code-ish words
// replaced by what the dog is doing, merged lines, summaries <= 400, ~ instead of the home path.
// Inputs are real lines Claude wrote in the live runs.   npx tsx test/speech.test.ts
import os from "node:os";
import { tilde } from "../src/project.ts";
import { activityLine, cutWords, mergeLines, speechLine, summarize } from "../src/runner.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { if (got !== want) { fail++; console.log(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); } };
const ok = (name: string, cond: boolean, got?: unknown) => { if (!cond) { fail++; console.log(`FAIL ${name}`, got ?? ""); } };

// clean sentences pass through (first sentence only)
eq("plain", speechLine("Now I'll build the shared stylesheet. Then the pages."), "Now I'll build the shared stylesheet.");
eq("plain2", speechLine("Now the JS for nav toggle, gallery filtering, and lightbox."), "Now the JS for nav toggle, gallery filtering, and lightbox.");
eq("markdown", speechLine("**All green.** Launching next."), "All green.");
// long: cut at a word boundary, <= 80
const long = speechLine("Let me verify all image references match actual files and do a final sanity check of the whole site before finishing.")!;
ok("long <= 80", long.length <= 80 && long.endsWith("…") && !/\s…$/.test(long), long);
ok("long word boundary", "Let me verify all image references match actual files and do a final sanity check of the whole site".startsWith(long.slice(0, -1)), long);
// code-ish -> null (the dog's activity is said instead)
for (const t of [
  "Darkened the sticky header background from rgba(15, 27, 45, 0.96) to rgba(7, 13, 22, 0.97).",
  "Darkened the top navigation bar from 161b22 to 0b0e13.",
  "Set the header to #0b1220 so it matches the footer.",
  "`assets/about/website-template-notes.md` contains a hidden HTML comment.",
  "I'll put it in css/styles.css next.",
  "Updated index.html and gallery.html.",
  "Gave the hero 24px of padding.",
  "The nav uses { display: flex } now.",
  "Wrapped it in a <section> tag.",
  "Set --color-navy for the header.",
]) eq(`codeish: ${t.slice(0, 40)}`, speechLine(t), null);
// activity lines
eq("act gallery", activityLine("Write", { file_path: "/w/gallery.html", content: "<h1>" }), "Building the gallery page");
eq("act home", activityLine("Write", { file_path: "/w/index.html" }), "Building the home page");
eq("act header", activityLine("Edit", { file_path: "/w/css/styles.css", old_string: ".site-header { background: #10233b; }", new_string: ".site-header { background: #0b1220; }" }), "Styling the header");
eq("act styles", activityLine("Write", { file_path: "/w/css/styles.css" }), "Building the styles");
eq("act map", activityLine("Write", { file_path: "/w/contact.html", content: "<iframe src=\"https://www.google.com/maps/embed?pb=1\">" }), "Adding the contact map");
eq("act map js", activityLine("Write", { file_path: "/w/js/map.js", content: "new google.maps.Map(el)" }), "Adding the contact map");
eq("act read", activityLine("Read", { file_path: "/w/assets/about/company.md" }), "Looking at the company info");
eq("act bash", activityLine("Bash", { command: "ls -la" }), "Checking the work");
// merge
eq("merge fits", mergeLines(["Building the home page", "Building the styles"]), "Building the home page. Building the styles.");
eq("merge too long -> latest", mergeLines(["Now I'll build the shared stylesheet for every page of the site.", "Now the gallery page."]), "Now the gallery page.");
// cutWords never mid-word
eq("cut", cutWords("alpha beta gamma delta", 13), "alpha beta…");
// summaries <= 400, sentence-cut when possible
const res = "Done. Added careers.html with all 7 open positions (Site Superintendent, Lead Carpenter, Roofing Foreman, Concrete Finisher, Construction Apprentice, Project Estimator, Office Coordinator).\n\nEach card links to the apply form.\n\n- nav and footer link to Careers\n- JS filters by department\n- all pages validated\n\nNo sensitive content was found in the job description files. " + "The layout matches the rest of the site and works on phones. ".repeat(6);
const sum = summarize(res);
ok("summary <= 400", sum.length <= 400, sum.length);
ok("summary keeps list", /nav and footer link to Careers; JS filters by department;/.test(sum), sum);
ok("summary ends cleanly", /[.!?…]$/.test(sum), sum);
eq("summary short", summarize("All green.\n\nSite complete."), "All green. Site complete.");
// ~ instead of the home path
eq("tilde", tilde(`The site is built at ${os.homedir()}/tini-projects/rivera`), "The site is built at ~/tini-projects/rivera");
eq("tilde home", tilde(`cd ${os.homedir()}`), "cd ~");
console.log(fail ? `${fail} failures` : "all speech + summary + tilde checks pass");
process.exit(fail ? 1 : 0);
