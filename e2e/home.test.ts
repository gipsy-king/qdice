describe("Home", () => {
  test("should set title", async () => {
    const title = await page.title();
    expect(title).toBe("Qdice.wtf");
  });

  test('should display "Table" games link on page', async () => {
    await expect(page).toMatchElement(testId("table-games-link"), {
      text: "Planeta",
    });
  });

  test('should display "join" button on page', async () => {
    await expect(page).toMatchElement(testId("button-seat"), {
      text: "Play now",
    });
  });

  test("should display and close the login dialog", async () => {
    await expect(page).toClick(testId("button-seat"));
    await expect(page).toMatchElement(testId("login-dialog"));

    await expect(page).toClick(testId("login-close"), { text: "Close" });

    await expect(page).not.toMatchElement(testId("login-dialog"));
  });
});
