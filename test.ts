// import { meros } from "meros/browser";

// const PROD_URL = 'https://anteaterapi.com/v2/graphql';
// const DEV_URL = "https://anteater-api-staging-482.icssc.workers.dev/v2/graphql"

// async function getData(url: string, stream: boolean) {
//   const response = await fetch(`${url}`, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       ...(stream ? {Accept: "multipart/mixed"} : {})
//     },
//     body: JSON.stringify({
//       query: `
//         query Websoc($query: WebsocQuery!) {
//           websoc(query: $query) {
//             schools ${stream ? '@stream (initialCount: 0)' : ""} {
//               departments {
//                 deptCode
//                 courses {
//                   courseTitle
//                   courseNumber
//                   sections {
//                     sectionCode
//                     sectionType
//                     sectionNum
//                   }
//                 }
//               }
//             }
//           }
//         }
//       `,
//       variables:
//         {
//           "query": {
//             "quarter": "Fall",
//             "year": "2026"
//           }
//         }
//     })
//   });

//   if (!response.ok) {
//     throw new Error(`HTTP error: ${response.status}\n\n${response.statusText}\n\n${response}`)
//   }

//   const parts = await meros(response);
//   // Handle ordinary, non-streamed responses.
//   if (!(Symbol.asyncIterator in parts)) {
//     return parts.json();
//   }

//   let result: any;

//   for await (const part of parts) {
//     if (Array.isArray(part) || !part.json) continue;

//     const payload = part.body as any;

//     if (payload.data) {
//       result = payload.data;
//     }

//     for (const patch of payload.incremental ?? []) {
//       if (patch.items) {
//         result.websoc.schools.push(...patch.items);
//       }
//     }
//   }

//   return { data: result };

//   // const byteSize = new TextEncoder().encode(await response.text()).length;
//   // console.log(`fetched ${byteSize} amount of data`)
// }

// async function main() {
//   const useStream = true
//   console.log(`useStream=${useStream}`)
//   for (let i = 0; i < 1; i++) {
//     setTimeout(() => {
//       getData(DEV_URL, useStream)
//         .then((resp) => {
//           console.log(`Loop ${i} Finished in Main`)
//           const byteSize = new TextEncoder().encode(JSON.stringify(resp)).length;
//           console.log(`(${i}) fetched ${byteSize} amount of data`)
//         })
//     }, i * 1_000)

//   }
// }

// main().then()

// /*
// Current:
// Finished 3 runs before crashing with 503 Code

// */
