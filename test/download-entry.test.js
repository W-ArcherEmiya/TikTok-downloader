const test = require('node:test');
const assert = require('node:assert/strict');

const {
    cacheStructuredVideoRecords,
    downloadVideoEntry,
    downloadVideoUrl,
    getEntryCandidateUrls,
    getStructuredVideoCacheSize,
    getStructuredVideoRecord,
    gmDownload,
    inspectIsoBmffBytes,
    inspectIsoBmffRangeBytes,
    isFeedStyleCurrentVideoPage,
    isFriendFeedPage,
    isProfileBatchEligiblePage,
    isRecommendPage,
    isSearchModalPage,
    sanitizeDiagnosticUrl,
    validateBlobMediaTracks,
} = require('../douyin-downloader.user.js');

function makeBox(type, ...payloads) {
    const payload = Buffer.concat(payloads.map((value) => Buffer.from(value)));
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + header.length, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, payload]);
}

function makeHandler(handlerType) {
    return makeBox('hdlr', Buffer.alloc(8), Buffer.from(handlerType, 'ascii'), Buffer.alloc(12));
}

function makeTrack(handlerType) {
    return makeBox('trak', makeBox('mdia', makeHandler(handlerType)));
}

test('getEntryCandidateUrls keeps playable URLs in stable unique order', () => {
    const urls = getEntryCandidateUrls({
        videoUrl: 'https://video.example/primary.mp4',
        alternateUrls: [
            'https://video.example/primary.mp4',
            'blob:https://www.douyin.com/fallback',
            '',
            'javascript:alert(1)',
        ],
    });

    assert.deepEqual(urls, [
        'https://video.example/primary.mp4',
        'blob:https://www.douyin.com/fallback',
    ]);
});

test('getEntryCandidateUrls excludes already attempted URLs', () => {
    const urls = getEntryCandidateUrls({
        videoUrl: 'https://video.example/primary.mp4',
        alternateUrls: ['https://video.example/alternate.mp4'],
    }, {
        excludeUrls: ['https://video.example/primary.mp4'],
    });

    assert.deepEqual(urls, ['https://video.example/alternate.mp4']);
});

test('downloadVideoEntry retries candidates and forwards download options', async () => {
    const attempts = [];
    const notifications = [];
    const downloadOptions = { directoryHandle: { name: 'videos' } };

    const result = await downloadVideoEntry({
        videoUrl: 'https://video.example/expired.mp4',
        alternateUrls: ['https://video.example/working.mp4'],
    }, 'video.mp4', null, {
        downloadOptions,
        onFailure: () => {},
        onAttempt: (attempt) => notifications.push(attempt),
        download: async (url, filename, onProgress, options) => {
            attempts.push({ url, filename, onProgress, options });
            if (url.includes('expired')) {
                throw new Error('expired URL');
            }
        },
    });

    assert.equal(result.videoUrl, 'https://video.example/working.mp4');
    assert.equal(result.index, 1);
    assert.equal(result.total, 2);
    assert.deepEqual(attempts.map((attempt) => attempt.url), [
        'https://video.example/expired.mp4',
        'https://video.example/working.mp4',
    ]);
    assert.equal(attempts[1].filename, 'video.mp4');
    assert.deepEqual(attempts[0].options, {
        ...downloadOptions,
        rejectVideoOnly: true,
        inspectMediaTracks: true,
    });
    assert.deepEqual(attempts[1].options, {
        ...downloadOptions,
        rejectVideoOnly: false,
        inspectMediaTracks: true,
    });
    assert.deepEqual(notifications.map(({ index, total }) => ({ index, total })), [
        { index: 0, total: 2 },
        { index: 1, total: 2 },
    ]);
});

test('inspectIsoBmffBytes detects muxed audio and video tracks', () => {
    const mediaInfo = inspectIsoBmffBytes(makeBox(
        'moov',
        makeTrack('vide'),
        makeTrack('soun')
    ));

    assert.deepEqual(mediaInfo, {
        container: 'mp4',
        audio: true,
        video: true,
        conclusive: true,
        handlers: ['soun', 'vide'],
    });
});

test('inspectIsoBmffRangeBytes finds a complete moov box inside a tail range', () => {
    const tailRange = Buffer.concat([
        Buffer.alloc(37, 0xff),
        makeBox('moov', makeTrack('vide'), makeTrack('soun')),
        Buffer.alloc(19, 0xee),
    ]);
    const mediaInfo = inspectIsoBmffRangeBytes(tailRange);

    assert.equal(mediaInfo.conclusive, true);
    assert.equal(mediaInfo.video, true);
    assert.equal(mediaInfo.audio, true);
});

test('downloadVideoUrl uses native download after a conclusive range probe', async (t) => {
    const originalGmDownload = global.GM_download;
    const originalGmXmlhttpRequest = global.GM_xmlhttpRequest;
    const mediaBytes = makeBox('moov', makeTrack('vide'), makeTrack('soun'));
    const requests = [];
    const downloads = [];

    t.after(() => {
        if (originalGmDownload === undefined) {
            delete global.GM_download;
        } else {
            global.GM_download = originalGmDownload;
        }
        if (originalGmXmlhttpRequest === undefined) {
            delete global.GM_xmlhttpRequest;
        } else {
            global.GM_xmlhttpRequest = originalGmXmlhttpRequest;
        }
    });

    global.GM_xmlhttpRequest = (options) => {
        requests.push(options);
        queueMicrotask(() => {
            const response = mediaBytes.buffer.slice(
                mediaBytes.byteOffset,
                mediaBytes.byteOffset + mediaBytes.byteLength
            );
            options.onload({ status: 206, response });
        });
        return { abort: () => {} };
    };
    global.GM_download = (options) => {
        downloads.push(options);
        queueMicrotask(() => options.onload());
        return { abort: () => {} };
    };

    const result = await downloadVideoUrl(
        'https://video.example/muxed.mp4',
        'muxed.mp4',
        null,
        { inspectMediaTracks: true, rejectVideoOnly: true }
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.Range, 'bytes=0-2097151');
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].url, 'https://video.example/muxed.mp4');
    assert.equal(result.mediaInfo.audio, true);
    assert.equal(result.mediaInfo.video, true);
});

test('downloadVideoUrl rejects a probed video-only candidate before native download', async (t) => {
    const originalGmDownload = global.GM_download;
    const originalGmXmlhttpRequest = global.GM_xmlhttpRequest;
    const mediaBytes = makeBox('moov', makeTrack('vide'));
    let downloadCount = 0;

    t.after(() => {
        if (originalGmDownload === undefined) {
            delete global.GM_download;
        } else {
            global.GM_download = originalGmDownload;
        }
        if (originalGmXmlhttpRequest === undefined) {
            delete global.GM_xmlhttpRequest;
        } else {
            global.GM_xmlhttpRequest = originalGmXmlhttpRequest;
        }
    });

    global.GM_xmlhttpRequest = (options) => {
        queueMicrotask(() => {
            const response = mediaBytes.buffer.slice(
                mediaBytes.byteOffset,
                mediaBytes.byteOffset + mediaBytes.byteLength
            );
            options.onload({ status: 206, response });
        });
        return { abort: () => {} };
    };
    global.GM_download = () => {
        downloadCount += 1;
        return { abort: () => {} };
    };

    await assert.rejects(
        downloadVideoUrl(
            'https://video.example/video-only.mp4',
            'video-only.mp4',
            null,
            { inspectMediaTracks: true, rejectVideoOnly: true }
        ),
        (error) => error.code === 'VIDEO_ONLY_MEDIA'
    );
    assert.equal(downloadCount, 0);
});

test('validateBlobMediaTracks rejects a video-only MP4 when requested', async () => {
    const videoOnlyBlob = new Blob([
        makeBox('ftyp', Buffer.from('isom')),
        makeBox('moov', makeTrack('vide')),
    ], { type: 'video/mp4' });

    await assert.rejects(
        validateBlobMediaTracks(videoOnlyBlob, { rejectVideoOnly: true }),
        (error) => {
            assert.equal(error.code, 'VIDEO_ONLY_MEDIA');
            assert.equal(error.mediaInfo.video, true);
            assert.equal(error.mediaInfo.audio, false);
            return true;
        }
    );
});

test('downloadVideoEntry retries a video-only candidate and keeps the final fallback', async () => {
    const optionsSeen = [];
    const result = await downloadVideoEntry({
        videoUrl: 'https://video.example/video-only.mp4',
        alternateUrls: ['https://video.example/fallback.mp4'],
    }, 'video.mp4', null, {
        onFailure: () => {},
        download: async (url, filename, onProgress, options) => {
            optionsSeen.push(options);
            if (options.rejectVideoOnly) {
                const error = new Error('video only');
                error.code = 'VIDEO_ONLY_MEDIA';
                throw error;
            }
            return {
                mediaInfo: {
                    container: 'mp4',
                    audio: false,
                    video: true,
                    conclusive: true,
                    handlers: ['vide'],
                },
            };
        },
    });

    assert.equal(result.index, 1);
    assert.equal(result.mediaInfo.audio, false);
    assert.deepEqual(optionsSeen.map((options) => options.rejectVideoOnly), [true, false]);
});

test('downloadVideoEntry reports every attempted URL when all candidates fail', async () => {
    const entry = {
        videoUrl: 'https://video.example/first.mp4',
        alternateUrls: ['https://video.example/second.mp4'],
    };

    await assert.rejects(
        downloadVideoEntry(entry, 'video.mp4', null, {
            onFailure: () => {},
            download: async (url) => {
                throw new Error(`failed ${url}`);
            },
        }),
        (error) => {
            assert.match(error.message, /All 2 candidate video URLs failed/);
            assert.deepEqual(error.attemptedUrls, getEntryCandidateUrls(entry));
            assert.match(error.cause.message, /second\.mp4/);
            return true;
        }
    );
});

test('downloadVideoEntry rejects an entry without playable candidates', async () => {
    await assert.rejects(
        downloadVideoEntry({
            videoUrl: '',
            alternateUrls: ['data:text/plain,not-video'],
        }, 'video.mp4'),
        /No playable candidate video URLs were available/
    );
});

test('cacheStructuredVideoRecords can replace an equally scored stale record', () => {
    const videoId = '9876543210123456789';
    const staleRecord = {
        videoId,
        videoUrl: 'https://video.example/stale.mp4',
        meta: { title: 'Test video', author: 'Tester' },
    };
    const freshRecord = {
        ...staleRecord,
        videoUrl: 'https://video.example/fresh.mp4',
    };

    cacheStructuredVideoRecords([staleRecord]);
    cacheStructuredVideoRecords([freshRecord]);
    assert.equal(getStructuredVideoRecord(videoId).videoUrl, staleRecord.videoUrl);

    cacheStructuredVideoRecords([freshRecord], { replaceExisting: true });
    assert.equal(getStructuredVideoRecord(videoId).videoUrl, freshRecord.videoUrl);
});

test('structured video cache stays within its fixed capacity', () => {
    const records = Array.from({ length: 260 }, (_, index) => ({
        videoId: `880000000000${String(index).padStart(6, '0')}`,
        videoUrl: `https://video.example/cache-${index}.mp4`,
        meta: { title: `Cache ${index}`, author: 'Tester' },
    }));

    cacheStructuredVideoRecords(records);

    assert.equal(getStructuredVideoCacheSize(), 240);
    assert.equal(
        getStructuredVideoRecord(records.at(-1).videoId).videoUrl,
        records.at(-1).videoUrl
    );
});

test('gmDownload aborts a response whose reported total is too small', async (t) => {
    const originalGmDownload = global.GM_download;
    let aborted = false;
    t.after(() => {
        if (originalGmDownload === undefined) {
            delete global.GM_download;
        } else {
            global.GM_download = originalGmDownload;
        }
    });

    global.GM_download = (options) => {
        const handle = {
            abort: () => {
                aborted = true;
            },
        };
        queueMicrotask(() => {
            options.onprogress({ loaded: 238, total: 238 });
            options.onload();
        });
        return handle;
    };

    await assert.rejects(
        gmDownload('https://video.example/broken.mp4', 'broken.mp4'),
        /too small \(238 bytes\)/
    );
    assert.equal(aborted, true);
});

test('page classifiers keep feed tabs separate from profile batch pages', () => {
    const originalLocation = global.location;
    global.location = new URL('https://www.douyin.com/');

    try {
        assert.equal(isRecommendPage('https://www.douyin.com/?recommend=1'), true);
        assert.equal(isFeedStyleCurrentVideoPage('https://www.douyin.com/?recommend=1'), true);
        assert.equal(isRecommendPage('https://www.douyin.com/video/1234567890123456789'), false);
        assert.equal(isFriendFeedPage('https://www.douyin.com/friend'), true);
        assert.equal(isFeedStyleCurrentVideoPage('https://www.douyin.com/friend'), true);
        assert.equal(isFriendFeedPage('https://www.douyin.com/friend?modal_id=7629644398682279220'), false);

        const likePage = 'https://www.douyin.com/user/self?from_tab_name=main&showTab=like';
        assert.equal(isFeedStyleCurrentVideoPage(likePage), true);
        assert.equal(isProfileBatchEligiblePage(likePage), false);

        const profilePage = 'https://www.douyin.com/user/MS4wLjABAAAA-example';
        assert.equal(isProfileBatchEligiblePage(profilePage), true);
        assert.equal(isProfileBatchEligiblePage(`${profilePage}?modal_id=7629644398682279220`), false);

        const searchModal = 'https://www.douyin.com/jingxuan/search/test?modal_id=7631206561197908070&type=general';
        assert.equal(isSearchModalPage(searchModal), true);
        assert.equal(isFeedStyleCurrentVideoPage(searchModal), false);
    } finally {
        if (originalLocation === undefined) {
            delete global.location;
        } else {
            global.location = originalLocation;
        }
    }
});

test('sanitizeDiagnosticUrl removes signatures while preserving safe page routing fields', () => {
    const pageUrl = sanitizeDiagnosticUrl(
        'https://www.douyin.com/user/self?aid=private&modal_id=7629644398682279220&showTab=like&type=general&signature=secret',
        { preservePageParams: true }
    );
    const mediaUrl = sanitizeDiagnosticUrl(
        'https://v3-web.douyinvod.com/video/tos/example.mp4?signature=secret&token=private'
    );

    assert.equal(
        pageUrl,
        'https://www.douyin.com/user/self?modal_id=7629644398682279220&showTab=like&type=general'
    );
    assert.equal(mediaUrl, 'https://v3-web.douyinvod.com/video/tos/example.mp4');
    assert.equal(sanitizeDiagnosticUrl('blob:https://www.douyin.com/private-id'), 'blob:[current-page]');
});
