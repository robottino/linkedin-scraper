const argv = require('minimist')(process.argv.slice(2))
console.log(argv)
const puppeteer = require('puppeteer')

const LOOP_TIMEOUT = 1000 * 60 * 5

const USERNAME_SELECTOR = '#login-email'
const PASSWORD_SELECTOR = '#login-password'
const BUTTON_SELECTOR = '#login-submit'

const CREDS = require('./creds.js')

function setLaunchOptions() {
    if (argv.rpi) {
        return {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
            executablePath: '/usr/bin/chromium-browser'
        }
    } else {
        return {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        }
    }
}

const LAUNCH_OPTIONS = setLaunchOptions()
console.log(LAUNCH_OPTIONS);

async function createPage(browser, width, height) {
    const page = await browser.newPage()
    await page.setViewport({ height, width })

    // Window frame - probably OS and WM dependent.
    height += 85

    // Any tab.
    const { targetInfos: [{ targetId }] } = await browser._connection.send(
        'Target.getTargets'
    )

    // Tab window. 
    const { windowId } = await browser._connection.send(
        'Browser.getWindowForTarget',
        { targetId }
    )

    // Resize.
    await browser._connection.send('Browser.setWindowBounds', {
        bounds: { height, width },
        windowId
    })

    return page
}


async function parsePageForFeeds(selector) {
    let AUTHOR_RELATIVE_SELECTOR = 'div.feed-shared-actor.ember-view div a h3 span span'
    let LIKER_RELATIVE_SELECTOR = 'div.feed-shared-header span div span a span'
    let CLICK_RELATIVE_SELECTOR = 'div.feed-shared-social-actions.feed-shared-social-action-bar.ember-view button.like-button'
    let ALREADY_LIKED_RELATIVE_SELECTOR = 'div.feed-shared-social-actions.feed-shared-social-action-bar.ember-view button.like-button.active'
    let TITLE_RELATIVE_SELECTOR = 'div.feed-shared-update-v2 article div div a h2 span'

    let data = []
    let elements = document.getElementsByClassName(selector)
    console.log(elements)
    for (let element of elements) {
        let qa = element.querySelector(AUTHOR_RELATIVE_SELECTOR)
        let author = null
        if (qa != null) author = qa.textContent

        let ql = element.querySelector(LIKER_RELATIVE_SELECTOR)
        let liker = null
        if (ql != null) liker = ql.textContent

        let qt = element.querySelector(TITLE_RELATIVE_SELECTOR)
        let title = null
        if (qt != null) title = qt.textContent


        data.push({
            liker: liker,
            author: author,
            likeClickSelector: '#' + element.id + ' ' + CLICK_RELATIVE_SELECTOR,
            liked: element.querySelector(ALREADY_LIKED_RELATIVE_SELECTOR) != null,
            title: title,
            elementId: element.id
        })
    }
    return data
}

async function login(page) {
    await page.goto('https://www.linkedin.com/', { waitUntil: ['load', 'networkidle2'] })
    await page.type(USERNAME_SELECTOR, CREDS.username)
    await page.type(PASSWORD_SELECTOR, CREDS.password)
    await Promise.all([
        page.waitForNavigation({ waitUntil: ['load', 'networkidle2'] }),
        page.click(BUTTON_SELECTOR),
    ])
}


async function run() {
    let browser = await puppeteer.launch(LAUNCH_OPTIONS)

    let page = await createPage(browser, 1920, 1080)

    let FEEDS_CLASS_SELECTOR = 'feed-shared-update-v2 feed-shared-update ember-view'
    let NEW_UPDATES_SELECTOR = 'button.feed-new-update-pill__new-update-button'

    await login(page)
    // Successfully logged in

    async function likeFeeds() {
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: ['load', 'networkidle2'] })

        let feeds = await page.evaluate(parsePageForFeeds, FEEDS_CLASS_SELECTOR)
        console.log(feeds)

        for (let feed of feeds) {
            if (!feed.liked) {
                console.log('Will like post from ' + feed.author)
                await page.click(feed.likeClickSelector)
            } else {
                console.log('post from ' + feed.author + ' Already liked')
            }
        }

        try {
            await page.waitFor(NEW_UPDATES_SELECTOR, { visible: true, timeout: LOOP_TIMEOUT })
        } catch (error) {
            console.log('Timed out')
        }
    }

    await likeFeeds()
    setInterval(await likeFeeds, LOOP_TIMEOUT)

}

run()
