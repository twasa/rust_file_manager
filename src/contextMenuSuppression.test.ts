import { describe, it, expect, vi } from "vitest";
import {
  isBrowserHotkeySuppressed,
  preventDefaultContextMenu,
} from "./utils/browserEvents";

describe("Browser event and context menu suppression", () => {
  it("prevents default context menu event", () => {
    const mockEvent = {
      preventDefault: vi.fn(),
    };
    preventDefaultContextMenu(mockEvent);
    expect(mockEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("suppresses browser print and reload hotkeys (Ctrl+P, Ctrl+R, Ctrl+S)", () => {
    // Ctrl+P / Cmd+P (列印)
    expect(isBrowserHotkeySuppressed({ ctrlKey: true, key: "p" })).toBe(true);
    expect(isBrowserHotkeySuppressed({ metaKey: true, key: "P" })).toBe(true);

    // Ctrl+S / Cmd+S (另存網頁)
    expect(isBrowserHotkeySuppressed({ ctrlKey: true, key: "s" })).toBe(true);
    expect(isBrowserHotkeySuppressed({ metaKey: true, key: "S" })).toBe(true);

    // Ctrl+R / Cmd+R (重載網頁)
    expect(isBrowserHotkeySuppressed({ ctrlKey: true, key: "r" })).toBe(true);
    expect(isBrowserHotkeySuppressed({ metaKey: true, key: "R" })).toBe(true);

    // Ctrl+Shift+R 應用程式進階批次命名熱鍵：不可被阻擋
    expect(
      isBrowserHotkeySuppressed({ ctrlKey: true, shiftKey: true, key: "r" })
    ).toBe(false);
    expect(
      isBrowserHotkeySuppressed({ metaKey: true, shiftKey: true, key: "R" })
    ).toBe(false);

    // Alt 組合鍵不阻擋
    expect(
      isBrowserHotkeySuppressed({ ctrlKey: true, altKey: true, key: "r" })
    ).toBe(false);

    // 一般按鍵不阻擋
    expect(isBrowserHotkeySuppressed({ key: "r" })).toBe(false);
    expect(isBrowserHotkeySuppressed({ key: "p" })).toBe(false);
    expect(isBrowserHotkeySuppressed({ key: "s" })).toBe(false);
  });
});
