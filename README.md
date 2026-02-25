# BISTU教务系统工具集

适用于北京信息科技大学教务系统的油猴脚本集合，包含一键评教、课程表导出和主页渲染修复功能。

## 脚本列表

### 1. 一键评教脚本
- 🚀 一键自动选中所有评教选项
- 🔍 智能检测评教元素，无元素时给出清晰提示
- 🎨 醒目按钮样式，固定在页面右侧，不遮挡操作
- 🔄 适配单页应用路由变化，页面跳转后自动重建按钮
- [详细文档](docs/bistu-jwxt-auto-evaluate.md)
- [安装链接](https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-auto-evaluate.user.js)

### 2. 课程表导出脚本
- 📅 导出教务系统课程表为CSV格式
- 📆 导出课程表为iCal格式，支持导入到日历应用
- 🚀 新增GitHub Page导出功能，生成可扫码订阅的webcal链接
- 📱 生成QR code，手机扫码即可订阅日历
- 🏫 按学号分类存储ics文件，每个学号一个独立文件夹
- 🔧 支持服务提供商选择
- ⏰ 添加15秒倒计时，提示等待服务器同步
- 🔄 支持最新教务系统页面结构
- 🎯 导出后可导入到WakeUP课程表等第三方应用
- 🎓 自动获取学期周次信息，确保日历事件时间准确
- [详细文档](docs/bistu-jwxt-export-schedule.md)
- [安装链接](https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-export-schedule.user.js)

### 3. 主页渲染修复脚本
- 🛠️ 修复教务系统主页课程信息的HTML渲染问题
- 🔄 自动监听页面变化，实时修复新添加的元素
- 📋 支持修复转义的HTML标签，如 &lt;a&gt; 等
- 🌐 适配单页应用的动态内容加载
- [详细文档](docs/bistu-jwxt-fix-rendering.md)
- [安装链接](https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-fix-rendering.user.js)

## 安装方法
1. 浏览器安装油猴插件（Tampermonkey/Greasemonkey）
2. 点击上方对应脚本的「安装链接」，油猴会自动识别并安装

## 注意事项
- 脚本仅负责辅助操作，最终提交需手动确认
- 若按钮未显示，可刷新页面重试
- 如页面DOM结构变更导致脚本失效，可提Issue反馈

## 许可证
MIT License