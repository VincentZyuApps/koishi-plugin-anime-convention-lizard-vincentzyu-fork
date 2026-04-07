import Fastify from 'fastify';
import { Context } from 'koishi';
import { parseEvent } from './api';

const CPP_API_BASE = 'https://www.allcpp.cn/allcpp/event/eventMainListV2.do';

interface ServerConfig {
  host: string;
  port: number;
}

export class LocalApiServer {
  private fastify: ReturnType<typeof Fastify>;
  private config: ServerConfig;
  private ctx: Context;
  private isRunning: boolean = false;

  constructor(ctx: Context, config: ServerConfig) {
    this.ctx = ctx;
    this.config = config;
    this.fastify = Fastify({
      logger: false,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.ctx.logger.info('[AnimeConventionLizard] 本地API服务器已在运行');
      return;
    }

    try {
      // 注册 /search 端点
      this.fastify.get('/search', async (request: any, reply: any) => {
        const { msg } = request.query as { msg?: string };
        
        this.ctx.logger.info(`[漫展-Server][/search] 收到请求, msg=${msg}`);
        
        if (!msg) {
          this.ctx.logger.warn(`[漫展-Server][/search] 缺少关键词参数`);
          return reply.code(400).send({
            code: 400,
            msg: '缺少关键词参数',
            data: [],
          });
        }

        try {
          const allcppResult = await this.fetchFromAllcpp(msg, 1);
          // 转换 allcpp 原始格式为插件期望的 { code, data } 格式，并使用 parseEvent 解析数据
          const rawData: any[] = allcppResult.result?.list || [];
          const parsedData = rawData.map(item => parseEvent(item));
          const result = {
            code: 200,
            msg: msg,
            data: parsedData,
          };
          this.ctx.logger.info(`[漫展-Server][/search] 返回结果: code=${result.code}, data长度=${result.data?.length || 0}`);
          return result;
        } catch (error: any) {
          this.ctx.logger.error(`[漫展-Server][/search] 请求allcpp.cn失败: ${error.message}`);
          return reply.code(500).send({
            code: 500,
            msg: error.message || '请求失败',
            data: [],
          });
        }
      });

      // 注册 /search_all 端点
      this.fastify.get('/search_all', async (request: any, reply: any) => {
        this.ctx.logger.info(`[漫展-Server][/search_all] 收到请求`);
        try {
          const allcppResult = await this.fetchFromAllcpp('', 1, 100);
          const rawData: any[] = allcppResult.result?.list || [];
          const parsedData = rawData.map(item => parseEvent(item));
          const result = {
            code: 200,
            msg: '',
            data: parsedData,
          };
          this.ctx.logger.info(`[漫展-Server][/search_all] 返回结果: code=${result.code}, data长度=${result.data?.length || 0}`);
          return result;
        } catch (error: any) {
          this.ctx.logger.error(`[漫展-Server][/search_all] 请求allcpp.cn失败: ${error.message}`);
          return reply.code(500).send({
            code: 500,
            msg: error.message || '请求失败',
            data: [],
          });
        }
      });

      await this.fastify.listen({ 
        port: this.config.port, 
        host: this.config.host 
      });

      this.isRunning = true;
      this.ctx.logger.info(`[AnimeConventionLizard] 本地API服务器已启动: http://${this.config.host}:${this.config.port}`);
    } catch (error: any) {
      this.ctx.logger.error('[AnimeConventionLizard] 启动本地API服务器失败:', error.message);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.fastify.close();
      this.isRunning = false;
      this.ctx.logger.info('[AnimeConventionLizard] 本地API服务器已停止');
    } catch (error: any) {
      this.ctx.logger.error('[AnimeConventionLizard] 停止本地API服务器失败:', error.message);
    }
  }

  private async fetchFromAllcpp(keyword: string, page: number, pageSize: number = 10): Promise<any> {
    const params = new URLSearchParams({
      time: '8',
      sort: '1',
      keyword,
      pageNo: String(page),
      pageSize: String(pageSize),
    });

    const url = `${CPP_API_BASE}?${params.toString()}`;

    const response = await this.ctx.http.get(url, {
      headers: {
        'Host': 'www.allcpp.cn',
        'Connection': 'keep-alive',
        'Accept': '*/*',
        'errorWrap': 'json',
        'Origin': 'https://cp.allcpp.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-Dest': 'empty',
        'Referer': 'https://cp.allcpp.cn/',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      },
    });

    return response;
  }
}
