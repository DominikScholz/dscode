import { describe, expect, it, vi } from "vite-plus/test";
import { createGraphAvatarLookup } from "./graphAvatar";

const result = (email: string, id: number | null = 123) =>
  Response.json({
    items: [{ author: id === null ? null : { id }, commit: { author: { email } } }],
  });

describe("graph GitHub avatar lookup", () => {
  it("matches regular commit emails and coalesces requests across commit rows", async () => {
    const request = vi.fn<typeof fetch>(async () => result("ada@example.com"));
    const lookup = createGraphAvatarLookup(request);
    const avatars = await Promise.all([lookup(" Ada@Example.com "), lookup("ada@example.com")]);
    expect(avatars).toEqual([
      "https://avatars.githubusercontent.com/u/123?s=40",
      "https://avatars.githubusercontent.com/u/123?s=40",
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(new URL(String(request.mock.calls[0]![0])).searchParams.get("q")).toBe(
      "author-email:ada@example.com",
    );
    expect(request.mock.calls[0]![1]?.credentials).toBe("omit");
  });
  it("does not guess an account when GitHub returns a different or unlinked author", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(result("another@example.com"))
      .mockResolvedValueOnce(result("ada@example.com", null));
    const lookup = createGraphAvatarLookup(request);
    expect(await lookup("ada@example.com")).toBeNull();
    expect(await lookup("unlinked@example.com")).toBeNull();
  });
  it("falls back on invalid responses and offline errors", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: "bad" }))
      .mockRejectedValueOnce(new Error("offline"));
    const lookup = createGraphAvatarLookup(request);
    expect(await lookup("ada@example.com")).toBeNull();
    expect(await lookup("bob@example.com")).toBeNull();
  });
  it("backs off after rate limits and retries after the cache expires", async () => {
    let time = 0;
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockImplementation(async () => result("ada@example.com"));
    const lookup = createGraphAvatarLookup(request, () => time);
    expect(await lookup("ada@example.com")).toBeNull();
    expect(await lookup("bob@example.com")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    time = 300_001;
    expect(await lookup("ada@example.com")).toBe(
      "https://avatars.githubusercontent.com/u/123?s=40",
    );
  });
  it("bounds requests when many authors have no portraits", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ items: [] }));
    const lookup = createGraphAvatarLookup(request);
    await Promise.all(
      Array.from({ length: 30 }, (_, index) => lookup(`author${index}@example.com`)),
    );
    expect(request).toHaveBeenCalledTimes(8);
    expect(await lookup('bad"query@example.com')).toBeNull();
    expect(request).toHaveBeenCalledTimes(8);
  });
});
