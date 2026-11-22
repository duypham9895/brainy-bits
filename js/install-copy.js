// Every user-visible string of the "Add to Home Screen" guide.
// Vietnamese first, English second. Rich lines are arrays of segments:
//   { t: 'text' }            plain
//   { t: 'text', hl: true }  key word, rendered in the coral highlight
// Render segments with textContent only (never innerHTML).
(() => {
  const seg = (t, hl) => (hl ? { t, hl: true } : { t });

  const COPY = {
    banner: {
      text: { vi: 'Cài Brainy Bits ra màn hình chính để mở nhanh như app', en: 'Add Brainy Bits to your Home Screen to open it fast, like an app' },
      cta: { vi: 'Xem cách cài', en: 'Show me how' },
      closeLabel: { vi: 'Ẩn gợi ý cài', en: 'Hide install tip' },
      regionLabel: { vi: 'Gợi ý cài ra màn hình chính', en: 'Install tip' }
    },

    settings: {
      mobile: {
        title: { vi: 'Cài ra màn hình chính', en: 'Add to Home Screen' },
        sub: { vi: 'Chạm một lần là mở, khỏi gõ địa chỉ', en: 'One tap to open, no typing the address' },
        button: { vi: 'Xem cách cài', en: 'Show me how' }
      },
      installed: {
        title: { vi: 'Đã cài ra màn hình chính', en: 'Added to your Home Screen' },
        sub: { vi: 'Đang mở từ biểu tượng trên màn hình chính', en: 'Opened from the Home Screen icon' },
        button: { vi: 'Xem lại cách cài', en: 'See the steps again' }
      },
      // Installed during this browser visit (appinstalled or an accepted prompt): still in the tab.
      added: {
        title: { vi: 'Đã cài ra màn hình chính', en: 'Added to your Home Screen' },
        sub: { vi: 'Bấm biểu tượng trên màn hình chính để mở', en: 'Tap the Home Screen icon to open it' },
        button: { vi: 'Xem lại cách cài', en: 'See the steps again' }
      },
      desktop: {
        title: { vi: 'Mở trang này trên điện thoại để cài ra màn hình chính', en: 'Open this page on your phone to add it to your Home Screen' },
        sub: { vi: 'Quét mã QR bằng camera điện thoại', en: 'Scan the QR code with your phone camera' },
        button: { vi: 'Mở mã QR', en: 'Show QR code' }
      }
    },

    dialog: {
      title: { vi: 'Thêm Brainy Bits ra màn hình chính', en: 'Add Brainy Bits to your Home Screen' },
      closeLabel: { vi: 'Đóng hướng dẫn', en: 'Close guide' },
      tablistLabel: { vi: 'Chọn loại điện thoại', en: 'Choose your phone' },
      tabs: {
        ios: { vi: 'iPhone', en: 'iPhone' },
        android: { vi: 'Android', en: 'Android' }
      },
      stepLabel: { vi: 'Bước', en: 'Step' },
      // Screen readers get words instead of the ••• and ⋮ glyphs.
      glyphNames: {
        '•••': { vi: 'ba chấm', en: 'three dots' },
        '⋮': { vi: 'ba chấm dọc', en: 'vertical three dots' }
      },
      footer: {
        vi: 'Biểu tượng sẽ xuất hiện trên màn hình chính. Bấm vào là mở như một ứng dụng.',
        en: 'The icon will appear on your Home Screen. Tap it to open like an app.'
      },
      done: { vi: 'Đã hiểu', en: 'Got it' }
    },

    ios: {
      steps: [
        {
          vi: [seg('Bấm nút '), seg('•••', true), seg(' ở góc dưới bên phải')],
          en: [seg('Tap the '), seg('•••', true), seg(' button at the bottom right')]
        },
        {
          vi: [seg('Chọn '), seg('Chia sẻ', true), seg(' (Share)')],
          en: [seg('Tap '), seg('Share', true)]
        },
        {
          vi: [seg('Kéo xuống, chọn '), seg('Thêm vào MH chính', true), seg(' (Add to Home Screen), rồi bấm '), seg('Thêm', true)],
          en: [seg('Scroll down, tap '), seg('Add to Home Screen', true), seg(', then tap '), seg('Add', true)]
        }
      ],
      note: {
        vi: 'Trên iPhone đời cũ, nút Chia sẻ (hình ô vuông có mũi tên lên) nằm ngay ở thanh dưới cùng.',
        en: 'On older iPhones, the Share button (square with an up arrow) is right in the bottom bar.'
      },
      otherBrowserNote: {
        vi: 'Nếu không thấy, hãy mở link này bằng Safari',
        en: "If you can't find it, open this link in Safari"
      }
    },

    android: {
      steps: [
        {
          vi: [seg('Bấm nút '), seg('⋮', true), seg(' ở góc trên bên phải')],
          en: [seg('Tap the '), seg('⋮', true), seg(' button at the top right')]
        },
        {
          vi: [seg('Chọn '), seg('Thêm vào màn hình chính', true), seg(' (Add to Home screen)')],
          en: [seg('Tap '), seg('Add to Home screen', true)]
        },
        {
          vi: [seg('Bấm '), seg('Thêm', true), seg(' (Add) để xác nhận')],
          en: [seg('Tap '), seg('Add', true), seg(' to confirm')]
        }
      ],
      note: {
        vi: 'Nếu không thấy mục này, tìm Cài đặt ứng dụng (Install app). Tác dụng giống nhau.',
        en: "Don't see it? Look for Install app instead. Same result."
      },
      artNote: {
        vi: 'Hình minh hoạ giao diện Chrome, máy của bạn có thể khác một chút.',
        en: 'Illustration of Chrome; your screen may look slightly different.'
      },
      installNow: { vi: 'Cài đặt ngay', en: 'Install now' }
    },

    inApp: {
      title: { vi: 'Mở bằng trình duyệt trước', en: 'Open in your browser first' },
      body: {
        vi: [seg('Bấm '), seg('•••', true), seg(' hoặc biểu tượng chia sẻ, chọn '), seg('Mở bằng Safari/Chrome', true)],
        en: [seg('Tap '), seg('•••', true), seg(' or the share icon, then pick '), seg('Open in Safari/Chrome', true)]
      },
      copyLink: { vi: 'Sao chép link', en: 'Copy link' },
      copied: { vi: 'Đã sao chép', en: 'Copied' },
      copyFallback: {
        vi: 'Đã chọn sẵn link. Nhấn giữ vào link rồi chọn Sao chép.',
        en: 'The link is selected. Press and hold it, then tap Copy.'
      },
      linkFieldLabel: { vi: 'Link của trang này', en: 'Link to this page' }
    }
  };

  const deepFreeze = (o) => {
    Object.values(o).forEach((v) => {
      if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
    });
    return Object.freeze(o);
  };

  const g = typeof window !== 'undefined' ? window : globalThis;
  g.BB_INSTALL_COPY = deepFreeze(COPY);
})();
