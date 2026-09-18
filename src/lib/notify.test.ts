import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendNotification } from './notify';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('ok'));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const notification = {
  event: 'error.new',
  title: 'New error on Shop: TypeError',
  text: 'x is undefined',
  url: 'https://gw.example.com/websites/1/errors/2',
  fields: [{ name: 'Release', value: '2.4.1' }],
  level: 'danger' as const,
};

const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('sendNotification', () => {
  it('posts Slack text with the fields and a link', async () => {
    await sendNotification(
      { id: '1', name: 's', type: 'slack', config: { url: 'https://hooks.slack.com/x' } },
      notification,
    );

    expect(fetchMock.mock.calls[0][0]).toBe('https://hooks.slack.com/x');
    expect(sent().text).toContain('*New error on Shop: TypeError*');
    expect(sent().text).toContain('*Release:* 2.4.1');
    expect(sent().text).toContain('|Open in Ghostwire Analytics>');
  });

  it('posts a Discord embed coloured by level', async () => {
    await sendNotification(
      {
        id: '1',
        name: 'd',
        type: 'discord',
        config: { url: 'https://discord.com/api/webhooks/x' },
      },
      notification,
    );

    const [embed] = sent().embeds;
    expect(embed).toMatchObject({
      title: notification.title,
      url: notification.url,
      color: 0xef4444,
    });
    expect(embed.fields).toEqual([{ name: 'Release', value: '2.4.1', inline: true }]);
  });

  it('signs webhook bodies when a secret is set', async () => {
    await sendNotification(
      {
        id: '1',
        name: 'w',
        type: 'webhook',
        config: { url: 'https://example.com/hook', secret: 's3' },
      },
      notification,
    );

    const [, init] = fetchMock.mock.calls[0];
    const expected = createHmac('sha256', 's3').update(init.body).digest('hex');
    expect(init.headers['x-ghostwire-signature']).toBe(`sha256=${expected}`);
    expect(sent()).toMatchObject({ event: 'error.new', title: notification.title });
  });

  it('throws on a failed delivery so it can be logged', async () => {
    fetchMock.mockImplementation(
      async () => new Response('nope', { status: 404, statusText: 'Not Found' }),
    );

    await expect(
      sendNotification(
        { id: '1', name: 's', type: 'slack', config: { url: 'https://hooks.slack.com/x' } },
        notification,
      ),
    ).rejects.toThrow('404');
  });

  it('posts to Telegram with the bot token, chat ID and escaped HTML', async () => {
    await sendNotification(
      {
        id: '1',
        name: 't',
        type: 'telegram',
        config: { secret: '123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789', chatId: '-1001234567890' },
      },
      { ...notification, text: 'x < y && "quoted"' },
    );

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://api.telegram.org/bot123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789/sendMessage',
    );
    expect(sent()).toMatchObject({
      chat_id: '-1001234567890',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    expect(sent().text).toBe(
      [
        '<b>New error on Shop: TypeError</b>',
        'x &lt; y &amp;&amp; &quot;quoted&quot;',
        '<b>Release:</b> 2.4.1',
        '<a href="https://gw.example.com/websites/1/errors/2">Open in Ghostwire Analytics</a>',
      ].join('\n'),
    );
  });

  it("includes the service's reason when it refuses a message", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), {
          status: 400,
          statusText: 'Bad Request',
        }),
    );

    await expect(
      sendNotification(
        { id: '1', name: 't', type: 'telegram', config: { secret: 'x', chatId: '1' } },
        notification,
      ),
    ).rejects.toThrow('400 Bad Request: Bad Request: chat not found');
  });

  it('refuses email when SMTP is not set up', async () => {
    await expect(
      sendNotification(
        { id: '1', name: 'e', type: 'email', config: { emails: ['a@example.com'] } },
        notification,
      ),
    ).rejects.toThrow('SMTP_URL');
  });
});
