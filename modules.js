// Note: Each check might take up to 5 seconds depending on how many books you have to update.
// Making this value too low might break the program.
const CHECK_EVERY_SECONDS = 3;

const { Client } = require("@notionhq/client");

require("dotenv").config();

if (!(process.envntn_56581071651aW8TqHHf7QAFeLBpWQOKlowNcjywYxkAcwx. && process.env.139d2c7ea323806aa997e24761d154d8)) {
    throw new Error("Please fill in your API key and database ID in repl.it");
}

const notion = new Client({ auth: process.env.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 });
const fetch = require("cross-fetch");

let dont_update = [];

const fetchAndUpdate = async () => {

    console.log("Current don't-update list is", dont_update)
    console.log("Restart server to clear.")
  
    const databaseId = process.env.139d2c7ea323806aa997e24761d154d8;

    const queryResponse = await notion.databases.query({
        139d2c7ea323806aa997e24761d154d8: databaseId,
        page_size: 100,
        filter: {
          or: [
            {
              property: "Title",
              rich_text: {
                contains: ";"
              }
            }
          ]
        }
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
                                    i.properties.Title.title[0].plain_text.replace(
                                        ";",
                                        ""
                                    ),
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
                                    (book.volumeInfo.description || "").length <
                                    500
                                        ? book.volumeInfo.description || ""
                                        : book.volumeInfo.description.substring(
                                              0,
                                              500
                                          ) + "...",
                            },
                        },
                    ],
                },

                Link: {
                    url: book.volumeInfo.previewLink,
                },
            },

            icon: {
                emoji: "📖",
            },
        };

        if (book.volumeInfo.imageLinks) {
            updateOptions.icon = {
                external: {
                    url: `https://readinglist-cover-proxy.srg.id.au/${book.id}.jpg`,
                },
            };

            updateOptions.cover = {
                external: {
                    url: `https://readinglist-cover-proxy.srg.id.au/${book.id}.jpg`,
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

    return all_updated;
};

module.exports.fetchAndUpdate = fetchAndUpdate;
