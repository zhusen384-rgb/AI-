// API Route 配置：增加请求体大小限制
// 这个文件需要在 API Route 中被引用

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10gb', // 增加请求体大小限制到 10GB
    },
  },
};
