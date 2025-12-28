const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const axios = require('axios');
const express = require('express');

// Configuration - Railway deployment ready
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://discord.com/api/webhooks/1454650371652976744/iP4ginwjzfsyILFnN100WXfQfrfLktxoLHagSzeBrR_4jxBIrBdInJu6h8ZNPLgqeKT7';
const NEXUS_ADMIN_KEY = process.env.NEXUS_ADMIN_KEY || '7c15becb-67a0-42d5-a601-89508553a149';
const NEXUS_API_URL = 'https://discord.nexusdevtools.com/lookup/roblox';
const TRADES_URL = 'https://www.rolimons.com/trades';


// Express server for healthcheck
const app = express();
const PORT = process.env.PORT || 3000;

let driver; // Global Selenium WebDriver instance
let profileDriver; // Dedicated driver for profile scraping
let processedUsers = new Set();
let totalLogged = 0;
let isScraping = false;
let retryCount = 0;
const MAX_RETRIES = 3;

// Healthcheck endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'healthy', 
        scraping: isScraping,
        totalLogged: totalLogged,
        timestamp: new Date().toISOString()
    });
});

// Start Express server
app.listen(PORT, () => {
    console.log(`🌐 Healthcheck server running on port ${PORT}`);
});

async function startScraper() {
    console.log('🔐 Initializing scraper...');
    const initialized = await initializeWebDriver();
    if (!initialized) {
        console.error('❌ Failed to initialize WebDriver, exiting.');
        process.exit(1);
    }

    console.log('🚀 Starting Rolimons Trade Ads scraper (infinite loop mode)...');
    isScraping = true;
    await scrapeTradeAdsPage();
    // This code will never execute as scrapeTradeAdsPage() runs in an infinite loop
}

async function initializeWebDriver() {
    try {
        console.log('🔧 Initializing Selenium WebDriver...');

        const options = new chrome.Options();
        options.addArguments('--headless');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--window-size=1920,1080');
        options.addArguments('--disable-web-security');
        options.addArguments('--disable-features=VizDisplayCompositor');
        options.addArguments('--disable-extensions');
        options.addArguments('--disable-plugins');
        options.addArguments('--disable-images');
        options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments('--exclude-switches=enable-automation');

        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // Initialize profile driver
        const profileOptions = new chrome.Options();
        profileOptions.addArguments('--headless');
        profileOptions.addArguments('--no-sandbox');
        profileOptions.addArguments('--disable-dev-shm-usage');
        profileOptions.addArguments('--disable-gpu');
        profileOptions.addArguments('--window-size=1920,1080');
        profileOptions.addArguments('--disable-web-security');
        profileOptions.addArguments('--disable-features=VizDisplayCompositor');
        profileOptions.addArguments('--disable-extensions');
        profileOptions.addArguments('--disable-plugins');
        profileOptions.addArguments('--disable-images');
        profileOptions.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        profileOptions.addArguments('--disable-blink-features=AutomationControlled');
        profileOptions.addArguments('--exclude-switches=enable-automation');

        profileDriver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(profileOptions)
            .build();

        console.log('✅ Selenium WebDriver initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ WebDriver initialization error:', error.message);
        return false;
    }
}

async function scrapeTradeAdsPage() {
    // Infinite loop to continuously scrape
    while (true) {
        try {
            console.log(`\n🔄 Starting new scraping cycle...`);
            console.log(`🔍 Navigating to Trade Ads page: ${TRADES_URL}`);
            
            // Navigate to the trades page
            await driver.get(TRADES_URL);
            
            // Wait for page to fully load
            console.log('⏳ Waiting for page to load...');
            await driver.sleep(8000);
            
            // Check page title and URL to verify we're on the right page
            try {
                const pageTitle = await driver.getTitle();
                const currentUrl = await driver.getCurrentUrl();
                console.log(`📄 Page Title: ${pageTitle}`);
                console.log(`🔗 Current URL: ${currentUrl}`);
            } catch (e) {
                console.log('⚠️ Could not get page info:', e.message);
            }
            
            // Check page source length to see if content loaded
            try {
                const pageSource = await driver.getPageSource();
                console.log(`📊 Page source length: ${pageSource.length} characters`);
                if (pageSource.length < 1000) {
                    console.log('⚠️ Page source seems too short, might not have loaded properly');
                }
            } catch (e) {
                console.log('⚠️ Could not get page source:', e.message);
            }

            // Wait for trade ads to load with longer timeout
            try {
                console.log('⏳ Waiting for trade ads to load (30s timeout)...');
                await driver.wait(until.elementLocated(By.css('a.ad_creator_name[href*="/player/"]')), 30000);
                console.log('✅ Trade ads loaded');
            } catch (e) {
                console.log('⚠️ Could not find trade ad creator links:', e.message);
                
                // Try alternative selectors
                console.log('🔍 Trying alternative selectors...');
                const alternativeSelectors = [
                    'a[href*="/player/"]',
                    '.ad_creator_name',
                    'a.ad_creator_name',
                    '[href*="/player/"]'
                ];
                
                let foundElements = false;
                for (const selector of alternativeSelectors) {
                    try {
                        const elements = await driver.findElements(By.css(selector));
                        if (elements.length > 0) {
                            console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
                            foundElements = true;
                            break;
                        }
                    } catch (err) {
                        continue;
                    }
                }
                
                if (!foundElements) {
                    console.log('❌ No user links found with any selector. Page might be blocked or structure changed.');
                    console.log('⏳ Waiting 30 seconds before retry...');
                    await new Promise(res => setTimeout(res, 30000));
                    continue;
                }
            }

            let totalPages = 1;
            
            try {
                // Find pagination container - look for pagination controls with longer timeout
                console.log('⏳ Looking for pagination (20s timeout)...');
                await driver.wait(until.elementLocated(By.css('.pagination, .page-link, [data-dt-idx]')), 20000);
                console.log('✅ Pagination found');

                // Try to find pagination buttons
                const pageButtons = await driver.findElements(By.css('a.page-link[data-dt-idx], .pagination a'));
                let lastPageButton = null;

                for (const button of pageButtons) {
                    try {
                        const text = (await button.getText()).trim();
                        if (/^\d+$/.test(text)) {
                            const pageNum = parseInt(text, 10);
                            if (!isNaN(pageNum) && pageNum > totalPages) {
                                totalPages = pageNum;
                                lastPageButton = button;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (lastPageButton && totalPages > 1) {
                    console.log(`📄 Highest page number found: ${totalPages}. Clicking it to go to last page...`);
                    try {
                        await lastPageButton.click();
                        console.log('✅ Regular click succeeded');
                    } catch (e) {
                        console.log(`⚠️ Regular click failed: ${e.message}, trying JS click...`);
                        await driver.executeScript('arguments[0].click();', lastPageButton);
                        console.log('✅ JS click succeeded');
                    }
                    await driver.sleep(5000);
                } else {
                    console.log('⚠️ Could not find a numeric last page button, assuming single page');
                }
            } catch (e) {
                console.log('⚠️ Error finding pagination:', e.message);
                console.log('ℹ️ Assuming single page or pagination not available');
            }

            console.log(`🔄 Starting continuous scraping from page ${totalPages} (last page) going backwards...`);

            for (let page = totalPages; page >= 1; page--) {
            console.log(`\n📄 Processing page ${page}/${totalPages}`);
            
            if (page !== totalPages) {
                // Click the Prev button or previous page link
                try {
                    // Try to find previous page button
                    const prevButtons = await driver.findElements(By.css('a.page-link[data-dt-idx="0"], .pagination .prev, .pagination a:contains("Prev"), .pagination a:contains("Previous")'));
                    let prevLink = null;
                    
                    for (const btn of prevButtons) {
                        try {
                            const text = (await btn.getText()).trim().toLowerCase();
                            const parentClass = (await btn.findElement(By.xpath('..')).getAttribute('class') || '').toLowerCase();
                            
                            if (text.includes('prev') || text.includes('«') || parentClass.includes('prev') || text === '0') {
                                const parent = await btn.findElement(By.xpath('..'));
                                const cls = ((await parent.getAttribute('class')) || '').toLowerCase();
                                
                                if (!cls.includes('disabled')) {
                                    prevLink = btn;
                                    break;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    if (prevLink) {
                        console.log('⬅️ Clicking Prev to move to previous page...');
                        try {
                            await prevLink.click();
                            console.log('✅ Prev regular click succeeded');
                        } catch (e) {
                            console.log(`⚠️ Prev regular click failed: ${e.message}, trying JS click...`);
                            await driver.executeScript('arguments[0].click();', prevLink);
                            console.log('✅ Prev JS click succeeded');
                        }
                        await driver.sleep(5000);
                    } else {
                        console.log('⏹️ Prev button not found or disabled; reached the first page.');
                        break;
                    }
                } catch (e) {
                    console.log(`❌ Could not click Prev for page ${page}: ${e.message}`);
                    break;
                }
            }

            // Find all user links on the current page
            let userLinks = [];
            try {
                console.log(`⏳ Looking for user links on page ${page} (30s timeout)...`);
                await driver.wait(until.elementLocated(By.css('a.ad_creator_name[href*="/player/"]')), 30000);
                userLinks = await driver.findElements(By.css('a.ad_creator_name[href*="/player/"]'));
                console.log(`✅ Found ${userLinks.length} user links on page ${page}`);
                
                // If no links found, try alternative selectors
                if (userLinks.length === 0) {
                    console.log('🔍 No links found with primary selector, trying alternatives...');
                    const altSelectors = [
                        'a[href*="/player/"]',
                        '.ad_creator_name',
                        'a.ad_creator_name'
                    ];
                    
                    for (const selector of altSelectors) {
                        try {
                            userLinks = await driver.findElements(By.css(selector));
                            if (userLinks.length > 0) {
                                console.log(`✅ Found ${userLinks.length} links with alternative selector: ${selector}`);
                                break;
                            }
                        } catch (err) {
                            continue;
                        }
                    }
                }
            } catch (e) {
                console.log(`❌ Could not find user links: ${e.message}`);
                console.log('⏳ Waiting 10 seconds before continuing...');
                await new Promise(res => setTimeout(res, 10000));
                continue;
            }
            
            if (userLinks.length === 0) {
                console.log(`❌ No users found on page ${page}, skipping...`);
                continue;
            }

            console.log(`👥 Processing ${userLinks.length} users on page ${page}`);

            for (let i = 0; i < userLinks.length; i++) {
                try {
                    // Re-find links to avoid stale element reference
                    const currentLinks = await driver.findElements(By.css('a.ad_creator_name[href*="/player/"]'));
                    if (i >= currentLinks.length) {
                        console.log(`⏭️ Link ${i} no longer exists, skipping...`);
                        continue;
                    }
                    const link = currentLinks[i];

                    // Get username
                    let username = (await link.getText()) || '';
                    username = username.trim();

                    if (!username) {
                        try {
                            username = ((await link.getAttribute('textContent')) || '').trim();
                        } catch (_) {
                            // ignore
                        }
                    }

                    // Build absolute Rolimons profile URL from href
                    let profileUrl = (await link.getAttribute('href')) || '';
                    if (profileUrl && !profileUrl.startsWith('http')) {
                        profileUrl = `https://www.rolimons.com${profileUrl}`;
                    }

                    if (!username) {
                        console.log(`⚠️ Username text empty for link ${i}, proceeding with profile link: ${profileUrl}`);
                        if (profileUrl) {
                            const parts = profileUrl.split('/').filter(Boolean);
                            username = parts[parts.length - 1] || 'Unknown';
                        } else {
                            username = 'Unknown';
                        }
                    }

                    if (processedUsers.has(username)) {
                        console.log(`⏭️ Skipping already processed user: ${username}`);
                        await new Promise(res => setTimeout(res, 6000));
                        continue;
                    }

                    console.log(`🔍 Checking user ${i + 1}/${userLinks.length}: ${username}`);
                    console.log(`   Profile URL: ${profileUrl}`);

                    // Scrape user profile for data with timeout
                    console.log(`   ⏳ Scraping profile...`);
                    const profileStartTime = Date.now();
                    let rolimons;
                    try {
                        rolimons = await Promise.race([
                            scrapeRolimonsUserProfile(profileUrl),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Profile scraping timeout after 30s')), 30000)
                            )
                        ]);
                        const profileTime = ((Date.now() - profileStartTime) / 1000).toFixed(1);
                        console.log(`   ✅ Profile scraped in ${profileTime}s`);
                    } catch (profileError) {
                        console.error(`   ❌ Profile scraping failed: ${profileError.message}`);
                        rolimons = {
                            tradeAds: 0,
                            rap: 0,
                            value: 0,
                            avatarUrl: '',
                            lastOnlineText: 'Unknown',
                            lastOnlineDays: 999
                        };
                    }
                    rolimons.profileUrl = profileUrl;

                    // Extract user ID from URL
                    let userId = null;
                    try {
                        const urlParts = profileUrl.split('/');
                        userId = urlParts[urlParts.length - 1];
                        if (!userId || isNaN(userId)) {
                            userId = null;
                        }
                    } catch (e) {
                        console.log('⚠️ Could not extract user ID from URL');
                    }

                    // Filter: Skip if trade ads >= 600
                    if (rolimons.tradeAds >= 600) {
                        console.log(`❌ Too many trade ads (${rolimons.tradeAds}), skipping ${username}`);
                        processedUsers.add(username);
                        await new Promise(res => setTimeout(res, 2000));
                        continue;
                    }

                    // Filter: Skip if value < 100,000
                    if (rolimons.value === 0) {
                        console.log(`⚠️ Value is 0 for ${username}, skipping (possible rate limit or invalid profile)`);
                        processedUsers.add(username);
                        await new Promise(res => setTimeout(res, 2000));
                        continue;
                    }
                    
                    if (rolimons.value < 100000) {
                        console.log(`❌ Value too low (${rolimons.value}), skipping ${username}`);
                        processedUsers.add(username);
                        await new Promise(res => setTimeout(res, 2000));
                        continue;
                    }

                    // Filter: Check top item RAP via Roblox API
                    console.log(`   ⏳ Checking RAP for user ID: ${userId}`);
                    if (userId) {
                        try {
                            const topItemRAP = await Promise.race([
                                getTopItemRAP(userId),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('RAP check timeout after 15s')), 15000)
                                )
                            ]);
                            if (topItemRAP < 100000) {
                                console.log(`❌ Top item RAP too low (${topItemRAP}), skipping ${username}`);
                                processedUsers.add(username);
                                await new Promise(res => setTimeout(res, 2000));
                                continue;
                            }
                        } catch (rapError) {
                            console.log(`⚠️ RAP check failed: ${rapError.message}, continuing anyway`);
                        }
                    } else {
                        console.log(`⚠️ Could not get user ID, skipping RAP check for ${username}`);
                    }

                    // Process user - lookup Discord and send
                    console.log(`   ✅ User passed all filters! Processing...`);
                    console.log(`   ⏳ Looking up Discord for ${username}...`);
                    const hit = await lookupDiscordAndSend(username, rolimons);

                    // Wait 5 seconds before moving to the next user (reduced from 10)
                    await new Promise(res => setTimeout(res, 5000));
                    processedUsers.add(username);
                    if (hit) {
                        totalLogged++;
                        console.log(`   🎉 Discord found and sent! Total hits: ${totalLogged}`);
                    } else {
                        console.log(`   ℹ️ No Discord found for ${username}`);
                    }

                } catch (error) {
                    console.error(`❌ Error processing link ${i}:`, error.message);
                    // Add retry logic for critical errors
                    if (error.message.includes('failed to start a thread') || error.message.includes('SIGTRAP')) {
                        console.log('🔄 Critical error detected, attempting recovery...');
                        await new Promise(res => setTimeout(res, 10000));
                        
                        try {
                            if (driver) {
                                await driver.quit();
                            }
                            if (profileDriver) {
                                await profileDriver.quit();
                            }
                        } catch (e) {
                            console.log('Error closing broken drivers:', e.message);
                        }
                        
                        await initializeWebDriver();
                        processedUsers.add(username || `unknown_${i}`);
                        continue;
                    }
                }
            }
            console.log(`✅ Finished page ${page}/${totalPages}`);
        }
        console.log(`✅ All users processed in this cycle. Total valid hits so far: ${totalLogged}`);
        console.log(`🔄 Cycle complete. Reloading page and starting next cycle in 5 seconds...`);
        
        // Wait a bit before reloading
        await new Promise(res => setTimeout(res, 5000));
        
        // The loop will continue and reload the page
        
        } catch (error) {
            console.error('❌ Error during scraping:', error.message);
            
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                console.log(`🔄 Restarting scrape in 10 seconds... (attempt ${retryCount}/${MAX_RETRIES})`);
                
                try {
                    if (driver) await driver.quit();
                    if (profileDriver) await profileDriver.quit();
                } catch (e) {
                    console.log('Error closing drivers during restart:', e.message);
                }
                
                await initializeWebDriver();
                await new Promise(res => setTimeout(res, 10000));
                // Continue the loop instead of recursive call
            } else {
                console.log('❌ Max retries reached, waiting 30 seconds before retrying...');
                retryCount = 0;
                await new Promise(res => setTimeout(res, 30000));
            }
        }
    }
}


async function scrapeRolimonsUserProfile(profileUrl, retryAttempt = 0) {
    if (!profileDriver) {
        console.error('❌ Profile driver not initialized');
        return {
            tradeAds: 0,
            rap: 0,
            value: 0,
            avatarUrl: '',
            lastOnlineText: 'Unknown',
            lastOnlineDays: 999
        };
    }

    try {
        await profileDriver.get(profileUrl);
        await profileDriver.sleep(3000); // Increased to 3s for page load

        const getText = async (selector) => {
            try {
                const element = await profileDriver.findElement(By.css(selector));
                return await element.getText();
            } catch {
                return '';
            }
        };

        // Extract trade ads count
        let tradeAds = 0;
        try {
            try {
                const tradeAdsElement = await profileDriver.findElement(By.css('span.card-title.mb-1.text-light.stat-data.text-nowrap'));
                const text = await tradeAdsElement.getText();
                if (text && !isNaN(text.replace(/,/g, ''))) {
                    tradeAds = parseInt(text.replace(/,/g, '')) || 0;
                    console.log(`✅ Found trade ads with exact selector: ${tradeAds}`);
                }
            } catch (e) {
                console.log('⚠️ Exact selector failed, trying contextual search...');
            }
            if (tradeAds === 0) {
                try {
                    const contextElements = await profileDriver.findElements(By.xpath("//*[contains(text(), 'Trade Ads') and contains(text(), 'Created')]/following::*[contains(@class, 'stat-data')][1] | //*[contains(text(), 'Trade Ads') and contains(text(), 'Created')]/..//*[contains(@class, 'stat-data')]"));
                    if (contextElements.length > 0) {
                        const text = await contextElements[0].getText();
                        if (text && !isNaN(text.replace(/,/g, ''))) {
                            tradeAds = parseInt(text.replace(/,/g, '')) || 0;
                            console.log(`✅ Found trade ads via "Trade Ads Created" context: ${tradeAds}`);
                        }
                    }
                } catch (e) {
                    console.log('⚠️ Contextual search failed, trying alternative selectors...');
                }
            }
            if (tradeAds === 0) {
                const selectors = [
                    '.card-title.mb-1.text-light.stat-data.text-nowrap',
                    'span.stat-data.text-nowrap',
                    '.stat-data.text-nowrap',
                    '.card-title.stat-data'
                ];
                for (const selector of selectors) {
                    try {
                        const elements = await profileDriver.findElements(By.css(selector));
                        for (const element of elements) {
                            const text = await element.getText();
                            if (text && /^\d{1,3}(,\d{3})*$/.test(text)) {
                                const numValue = parseInt(text.replace(/,/g, ''));
                                if (numValue > 0 && numValue <= 100000) {
                                    tradeAds = numValue;
                                    console.log(`✅ Found trade ads: ${tradeAds} using selector: ${selector}`);
                                    break;
                                }
                            }
                        }
                        if (tradeAds > 0) break;
                    } catch (e) { continue; }
                }
            }
            if (tradeAds === 0) {
                console.log('⚠️ Could not find trade ads with any method');
            }
        } catch (e) {
            console.log('⚠️ Error finding trade ads:', e.message);
        }

        // Extract value from #player_value
        const value = parseInt((await getText('#player_value')).replace(/,/g, '')) || 0;
        console.log(`✅ Found value: ${value}`);
        
        // Check for rate limit indicators (value = 0 might indicate rate limit)
        if (value === 0) {
            console.log('⚠️ Warning: Value is 0 - possible rate limit detected');
        }

        // Extract Roblox avatar image URL
        let avatarUrl = '';
        try {
            const avatarImg = await profileDriver.findElement(By.css('img.mx-auto.d-block.w-100.h-100[src^="https://tr.rbxcdn.com/"]'));
            avatarUrl = await avatarImg.getAttribute('src');
            if (avatarUrl) {
                console.log(`✅ Found avatar URL: ${avatarUrl.substring(0, 60)}...`);
            }
        } catch (e) {
            console.log('⚠️ Could not find avatar image:', e.message);
        }

        return {
            tradeAds,
            rap: 0,
            value,
            avatarUrl: avatarUrl,
            lastOnlineText: 'Unknown',
            lastOnlineDays: 999
        };
    } catch (error) {
        console.error('❌ Failed to scrape profile:', error.message);
        
        // Retry logic for profile scraping
        if (retryAttempt < MAX_RETRIES && (error.message.includes('failed to start a thread') || error.message.includes('SIGTRAP'))) {
            console.log(`🔄 Retrying profile scrape (attempt ${retryAttempt + 1}/${MAX_RETRIES})...`);
            await new Promise(res => setTimeout(res, 5000));
            return await scrapeRolimonsUserProfile(profileUrl, retryAttempt + 1);
        }
        
        return {
            tradeAds: 0,
            rap: 0,
            value: 0,
            avatarUrl: '',
            lastOnlineText: 'Unknown',
            lastOnlineDays: 999
        };
    }
}

async function getTopItemRAP(userId) {
    try {
        const response = await axios.get(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles`, {
            params: {
                assetType: 'All',
                sortOrder: 'Desc',
                limit: 100
            }
        });

        const items = response.data.data || [];
        if (items.length === 0) {
            console.log(`⚠️ No items found for user ${userId}`);
            return 0;
        }

        // Find the item with the highest recentAveragePrice
        let topRAP = 0;
        for (const item of items) {
            if (item.recentAveragePrice && item.recentAveragePrice > topRAP) {
                topRAP = item.recentAveragePrice;
            }
        }

        console.log(`✅ Top item RAP for user ${userId}: ${topRAP}`);
        return topRAP;
    } catch (error) {
        console.error(`❌ Error fetching inventory for user ${userId}:`, error.message);
        // Return a high value to not skip the user if API fails (to be safe)
        return 999999;
    }
}

function extractDiscordFromRecord(record) {
    if (!record || typeof record !== 'object') return null;

    // Prefer explicit fields if present
    if (record.discord_tag) return String(record.discord_tag);
    if (record.discord_username && record.discriminator) {
        return `${record.discord_username}#${record.discriminator}`;
    }
    if (record.discord_username) return String(record.discord_username);

    // Nexus /lookup/roblox currently returns objects like:
    // { "username": "<discord username>", "score": 1100, "server_id": "..." }
    // So treat "username" as the Discord username when present.
    if (record.username) return String(record.username);

    // Fallback: any field whose key mentions "discord"
    const key = Object.keys(record).find(k => k.toLowerCase().includes('discord'));
    if (key && record[key]) {
        return String(record[key]);
    }

    return null;
}

async function lookupDiscordAndSend(robloxUsername, rolimonsData) {
    try {
        const response = await axios.get(NEXUS_API_URL, {
            params: { query: robloxUsername },
            headers: {
                'x-admin-key': NEXUS_ADMIN_KEY
            }
        });

        const body = response.data || {};
        const records = Array.isArray(body.data) ? body.data : [];

        if (!records.length) {
            console.log(`ℹ️ No Discord found for ${robloxUsername} (Nexus API returned empty data[])`);
            return false;
        }

        const discordRecord = records[0];
        const discordValue = extractDiscordFromRecord(discordRecord);

        if (!discordValue) {
            console.log(`ℹ️ Could not extract Discord field from Nexus API response for ${robloxUsername}`);
            return false;
        }

        await sendToWebhook(robloxUsername, discordValue, discordRecord, rolimonsData);
        return true;
    } catch (error) {
        console.error(`❌ Nexus API error for ${robloxUsername}:`, error.message);
        return false;
    }
}


async function sendToWebhook(robloxUsername, discordUsername, discordRecord, rolimonsData) {
    console.log(`📤 sendToWebhook called: Roblox=${robloxUsername}, Discord=${discordUsername}`);
    try {
        const fields = [];
        
        // Discord Username (primary field)
        fields.push({ 
            name: "Discord Username", 
            value: discordUsername, 
            inline: false 
        });
        
        // Discord ID if available from record
        if (discordRecord && discordRecord.user_id) {
            fields.push({ 
                name: "Discord ID", 
                value: discordRecord.user_id.toString(), 
                inline: true 
            });
        } else if (discordRecord && discordRecord.id) {
            fields.push({ 
                name: "Discord ID", 
                value: discordRecord.id.toString(), 
                inline: true 
            });
        }
        
        // Roblox Username
        fields.push({ 
            name: "Roblox Username", 
            value: robloxUsername, 
            inline: true 
        });
        
        // Rolimons Value
        if (rolimonsData && rolimonsData.value) {
            fields.push({ 
                name: "Value", 
                value: rolimonsData.value.toLocaleString(), 
                inline: true 
            });
        }
        
        // Trade Ads
        if (rolimonsData && rolimonsData.tradeAds !== undefined) {
            fields.push({ 
                name: "Trade Ads", 
                value: rolimonsData.tradeAds.toString(), 
                inline: true 
            });
        }
        
        // Build embed with thumbnail (avatar image)
        const embed = {
            title: "✨ New Discord Found!",
            color: 0x00AE86,
            fields: fields,
            timestamp: new Date().toISOString()
        };
        
        // Add thumbnail (Roblox avatar) if available
        if (rolimonsData && rolimonsData.avatarUrl) {
            embed.thumbnail = {
                url: rolimonsData.avatarUrl
            };
        }
        
        // Add Rolimons profile link if available
        if (rolimonsData && rolimonsData.profileUrl) {
            fields.push({
                name: "Rolimons Profile",
                value: `[View Profile](${rolimonsData.profileUrl})`,
                inline: false
            });
        }
        
        const payload = {
            embeds: [embed]
        };
        
        console.log('Sending webhook: new Discord found...');
        const response = await axios.post(WEBHOOK_URL, payload);
        console.log('✅ Webhook sent successfully, status:', response.status);
    } catch (e) {
        console.error('❌ Webhook POST error:', e.message);
        if (e.response) {
            console.error('Response status:', e.response.status);
            console.error('Response data:', e.response.data);
        }
    }
}

async function cleanup() {
    console.log('🧹 Cleaning up resources...');
    
    if (driver) {
        try {
            await driver.quit();
            console.log('✅ Main driver closed');
        } catch (e) {
            console.log('Error closing main driver:', e.message);
        }
    }
    
    if (profileDriver) {
        try {
            await profileDriver.quit();
            console.log('✅ Profile driver closed');
        } catch (e) {
            console.log('Error closing profile driver:', e.message);
        }
    }
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await cleanup();
});

// Railway deployment logging
console.log('🚀 Starting Railway deployment...');
console.log('📋 Configuration:');
console.log(`   - Webhook URL: ${WEBHOOK_URL.substring(0, 50)}...`);

startScraper();

