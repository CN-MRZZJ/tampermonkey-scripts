# BISTU教务系统工具集

适用于北京信息科技大学教务系统的油猴脚本集合，包含一键评教和课程表导出功能。

## 功能特点

### 一键评教脚本
> ⚠️ 注意：由于教务系统可能进行了更新，此功能可能暂时不可用
- 🚀 一键自动选中所有评教选项
- 🔍 智能检测评教元素，无元素时给出清晰提示
- 🎨 醒目按钮样式，固定在页面右侧，不遮挡操作
- 🔄 适配单页应用路由变化，页面跳转后自动重建按钮

### 课程表导出脚本
- 📅 导出教务系统课程表为CSV格式
- 📆 导出课程表为iCal格式，支持导入到日历应用
- 🔄 支持最新教务系统页面结构
- 🎯 导出后可导入到WakeUP课程表等第三方应用
- 🎓 自动获取学期周次信息，确保日历事件时间准确

## 安装方法
1. 浏览器安装油猴插件（Tampermonkey/Greasemonkey）
2. 点击下方链接，油猴会自动识别并安装脚本：
   - [一键评教脚本](https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-auto-evaluate.user.js)
   - [课程表导出脚本](https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-export-schedule.user.js)

## 使用说明

### 一键评教
> ⚠️ 注意：由于教务系统可能进行了更新，此功能可能暂时不可用
1. 登录教务系统，进入具体的评教条目页面
2. 点击右侧的「一键评教」按钮（如果显示）
3. 等待提示“评教完成”后，手动点击页面提交按钮即可
4. 若按钮未显示或功能失效，可能是因为教务系统页面结构发生了变化

### 课程表导出
1. 登录教务系统，进入课程表页面
2. 点击页面上的下拉菜单，选择导出格式：
   - **CSV**：导出为CSV格式，可导入到WakeUP课程表等应用
   - **iCal**：导出为iCal格式，可导入到Google日历、Apple日历等日历应用
3. 在弹出的学期选择界面中选择要导出的学期
4. 等待脚本运行完成，会自动下载对应格式的文件
5. 使用相应的应用导入文件

## 注意事项
- 脚本仅负责辅助操作，最终提交需手动确认
- 若按钮未显示，可刷新页面重试
- 如页面DOM结构变更导致脚本失效，可提Issue反馈

## 友商项目
- [neu_wisedu2wakeup](https://github.com/CreamPig233/neu_wisedu2wakeup) - 针对金智教育教务系统的课程表导出工具（东北大学）
- [bistu-courses-output](https://github.com/fire007012/bistu-courses-output) - 北京信息科技大学课程表导出工具

## 许可证
MIT License
