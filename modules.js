// Note: Each check might take up to 5 seconds depending on how many books you have to update.
// Making this value too low might break the program.
const CHECK_EVERY_SECONDS = 3;

const { Client } = require("@notionhq/client");

require("dotenv").config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const fetch = require("cross-fetch");

let dont_update = [];

const fetchAndUpdate = async () => {
  console.log("Current don't-update list is", dont_update);
  console.log("Restart server to clear.");

  const databaseId = process.env.DATABASE_ID;

  const queryResponse = await notion.databases.query({
    database_id: databaseId,
    page_size: 100,
    filter: {
      property: "Title",
      rich_text: {
        contains: ";",
      },
    },
  });

  const relevant_results = queryResponse.results.filter(
    (i) => !dont_update.includes(i.id)
  );

  console.log(
    `Checked database, found ${relevant_results.length} items to update.`
  );

  const all_updated = [];

  for (i of relevant_results) {
    gbook_query =
      i.properties.Title.title[0]
        .plain_text /*+ " " + i.properties["Author(s)"].multi_select.map(x => x.name).join(", ")*/;
    console.log(gbook_query);

    const j = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        gbook_query
      )}`
    ).then((r) => r.json());

    if (!(j.totalItems > 0)) {
      console.log("No results found for " + gbook_query);
      return;
    }

    const book = j.items[0];
    const isbn = book.volumeInfo.industryIdentifiers.find((i) =>
      ["ISBN_10", "ISBN_13"].includes(i.type)
    )?.identifier;

    let updateOptions = {
      page_id: i.id,

      properties: {
        Title: {
          title: [
            {
              type: "text",
              text: {
                content:
                  book.volumeInfo.title ||
                  i.properties.Title.title[0].plain_text.replace(";", ""),
              },
            },
          ],
        },

        "Author(s)": {
          multi_select: book.volumeInfo.authors
            .filter((x) => x)
            .map((x) => ({
              name: x.replace(",", ""),
            })),
        },

        "Genre(s)": {
          multi_select: (book.volumeInfo.categories || [])
            .filter((x) => x)
            .map((x) => ({
              name: x.replace(",", ""),
            })),
        },

        Description: {
          rich_text: [
            {
              text: {
                content:
                  (book.volumeInfo.description || "").length < 500
                    ? book.volumeInfo.description || ""
                    : book.volumeInfo.description.substring(0, 500) + "...",
              },
            },
          ],
        },

        Link: {
          url: `https://openlibrary.org/isbn/${isbn}`,
        },
      },

      icon: {
        emoji: "📖",
      },
    };

    if (isbn) {
      updateOptions.icon = {
        external: {
          url: `https://covers.openlibrary.org/b/isbn/${isbn}-S.jpg`,
        },
      };

      updateOptions.cover = {
        external: {
          url: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
        },
      };
    }

    if (book.volumeInfo.averageRating) {
      updateOptions.properties["Rating"] = {
        number: book.volumeInfo.averageRating,
      };
    }

    if (book.volumeInfo.pageCount) {
      updateOptions.properties["Pages"] = {
        number: book.volumeInfo.pageCount,
      };
    }

    try {
      await notion.pages.update(updateOptions);
      all_updated.push(i.properties.Title.title[0].plain_text);
    } catch (e) {
      console.error(`Error on ${i.id}: [${e.status}] ${e.message}`);

      if (e.status == 409) {
        console.log("Saving conflict, scheduling retry in 3 seconds");
        setTimeout(async () => {
          try {
            console.log(`Retrying ${i.id}`);
            await notion.pages.update(updateOptions);
          } catch (e) {
            console.error(
              `Subsequent error while resolving saving conflict on ${i.id}: [${e.status}] ${e.message}`
            );
            dont_update.push(i.id);
          }
        }, 3000);
      } else {
        dont_update.push(i.id);
      }
    }

    console.log("Updated " + i.properties.Title.title[0].plain_text);
  }

  if (process.env.AUTO_FETCH_INTERVAL) {
    setTimeout(fetchAndUpdate, process.env.AUTO_FETCH_INTERVAL);
  }
  return all_updated;
};

module.exports.fetchAndUpdate = fetchAndUpdate;
