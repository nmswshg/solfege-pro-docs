// @ts-check
const {test, expect} = require('@playwright/test');

test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'privacy contract runs once on desktop');
});

[
    ['/privacy/', 'アプリ内メッセージと通知'],
    ['/en/privacy/', 'In-App Messages and Notifications'],
    ['/fr/privacy/', 'Messages et notifications dans l’Application'],
    ['/de/privacy/', 'In-App-Nachrichten und Benachrichtigungen'],
    ['/es/privacy/', 'Mensajes y notificaciones dentro de la Aplicación'],
    ['/it/privacy/', 'Messaggi e notifiche nell’App'],
    ['/ko/privacy/', '앱 내 메시지 및 알림'],
    ['/pt-br/privacy/', 'Mensagens e notificações no Aplicativo'],
].forEach(([path, heading]) => {
    test(`support messaging disclosure is complete at ${path}`, async ({page}) => {
        await page.goto(path);
        await expect(page.getByRole('heading', {name: heading})).toBeVisible();
        const disclosure = page.locator('#in-app-messages').locator('xpath=following-sibling::p[1]');
        const retention = page.locator('#in-app-messages').locator('xpath=following-sibling::p[2]');
        await expect(disclosure).toContainText('Firebase Cloud Messaging');
        await expect(retention).toContainText('400');
        await expect(retention).toContainText(/Analytics/);
    });
});
