
const regex = /(```[\s\S]*?```)/g;

const cases = [
    "Simple:\n```javascript\ncode\n```\nEnd",
    "Space after tick:\n``` javascript\ncode\n```\nEnd",
    "No newline:\n```javascript code```\nEnd",
    "Multiline:\n```\nline1\nline2\n```",
];

cases.forEach((c, i) => {
    console.log(`--- Case ${i} ---`);
    console.log("String:", JSON.stringify(c));
    const parts = c.split(regex);
    console.log("Parts:", parts.map(p => `"${p}"`));
    console.log("Match?", parts.length > 1);
});
