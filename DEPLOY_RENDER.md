# 免费 Render 公网部署

当前状态：部署配置已准备。只有 Render 显示 Live，并验证其 HTTPS 地址后，才表示公网部署成功。

## 需要的账号

需要 Render 账号，以及保存部署代码的 GitHub 仓库。推荐使用私有仓库，只授权 Render 访问该仓库。网站本身部署后可公开访问。

代码包包含前后端、两份处理数据及本地前端库。不要上传整个本机项目，不需要上传 .venv、.env、.sources、论文、PPT、个人截图或密钥。

## 从独立部署目录上传

运行 `scripts/package_cloud.py` 会在 deploy 中生成带时间的目录与 ZIP。ZIP 是备份和传输包；上传 GitHub 时请解压并保持目录结构，不能只把 ZIP 文件放进仓库。

GitHub 仓库根目录应直接包含 app.py、requirements-cloud.txt、render.yaml、templates、static、data。

## 创建服务

在 Render 选择 New > Blueprint，并连接上述仓库，使用根目录 render.yaml。配置声明 plan 为 free，无付费数据库或磁盘。

如果选择 New > Web Service，使用以下设置：

| 设置 | 值 |
| --- | --- |
| Language | Python 3 |
| Root Directory | 留空（独立部署仓库） |
| Build Command | pip install -r requirements-cloud.txt |
| Start Command | gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 120 --access-logfile - --error-logfile - app:app |
| Instance Type | Free |
| Health Check Path | /api/health |
| Environment | PYTHON_VERSION=3.12.8、PYTHONUNBUFFERED=1、PYTHONIOENCODING=utf-8 |

云端使用 Gunicorn，不执行 Windows 的 setup.ps1 或 run.ps1。

## 上线验收

Render 显示 Live 后，使用实际分配的 HTTPS 域名打开首页和 /api/health。健康检查应返回 status=ok、national_records=40500、shanghai_records=713。

检查五城切换、预算筛选、图表和上海通勤模块。默认北京15000元预算应得到3230条候选，上海人民广场4500元60分钟应得到171个项目。最后在另一台设备上访问同一个 HTTPS 地址。

## 免费限制与费用控制

根据 https://render.com/docs/free，免费 Web Service 闲置15分钟后休眠，下次访问通常需要约一分钟唤醒。账户每月有免费运行时数及流量和构建额度限制。不要选择付费实例，不添加付费数据库或磁盘。本配置不需要信用卡信息；若注册或创建服务时平台另行要求付款或身份核验，请先核实当时政策。

服务器运行期间，个人电脑可以关机。国内网络访问境外免费平台的速度因网络而异，不能保证所有网络都能稳定连接。数据随源代码部署，当前没有用户上传或云端写入功能。

## 数据来源

五城公开学习样本：https://github.com/Windyhhh/Lianjia-Rental-Data-Analysis 。用于课程分析，不代表实时挂牌或全国市场总体。

上海项目快照：https://github.com/chenmisss/shanghai-landing-kit 。坐标和通勤为本项目演示估算，需在实际决策前核验。
