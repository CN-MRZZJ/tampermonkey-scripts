# BISTU教务系统主页渲染修复脚本

## 脚本信息
- **名称**: BISTU教务系统主页渲染修复
- **版本**: 1.0.0
- **作者**: MRZZJ
- **许可证**: MIT

## 功能介绍
- 🛠️ 修复教务系统主页课程信息的HTML渲染问题
- 🔄 自动监听页面变化，实时修复新添加的元素
- 📋 支持修复转义的HTML标签，如 &lt;a&gt; 等
- 🌐 适配单页应用的动态内容加载

## 安装方法
1. 浏览器安装油猴插件（Tampermonkey/Greasemonkey）
2. 点击 [主页渲染修复脚本](https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-fix-rendering.user.js) 安装

## 使用说明
1. 登录教务系统，进入主页
2. 脚本会自动运行，修复页面上的HTML渲染问题
3. 无需手动操作，脚本会实时监控页面变化并自动修复
4. 修复后的课程信息会正确显示链接和格式

## 技术实现
- **DOM监控**：使用MutationObserver监控页面变化
- **元素检测**：智能检测课程信息相关元素
- **转义修复**：利用浏览器的textContent解析特性，将解析后的内容设置为innerHTML
- **动态处理**：支持处理动态加载的内容，如tooltip等

## 修复效果

### 修复前
```html
<div class="kbappTimetableCourseRenderCourseItemInfoText___2Zmwu">
  &lt;a data-kblx="02" data-code="20030448" data-auth="1"&gt;张静华&lt;/a&gt;  
  &lt;a data-kblx="01" data-code="050123" data-auth="1"&gt;WLA-410&lt;/a&gt;
</div>
```

### 修复后
```html
<div class="kbappTimetableCourseRenderCourseItemInfoText___2Zmwu">
  <a data-kblx="02" data-code="20030448" data-auth="1">张静华</a>  
  <a data-kblx="01" data-code="050123" data-auth="1">WLA-410</a>
</div>
```

## 处理的元素类型
- **课程表元素**：`kbappTimetableCourseRenderCourseItemInfoText` 相关元素
- **Tooltip元素**：`courseLi` 相关元素
- **其他包含转义HTML的元素**

## 工作原理
1. 当页面加载或动态添加元素时，脚本会检测课程相关元素
2. 对于包含转义HTML的元素，脚本会：
   - 获取元素的textContent（浏览器会自动解析转义的HTML实体）
   - 将解析后的内容设置为元素的innerHTML
   - 这样浏览器就会正确渲染HTML标签

## 常见问题
1. **修复不生效**
   - 尝试刷新页面
   - 检查浏览器控制台是否有错误信息
   - 确认脚本是否正确安装

2. **部分元素未修复**
   - 脚本会监控页面变化，等待一段时间后会自动修复
   - 若仍未修复，可能是因为元素结构与预期不符

3. **性能影响**
   - 脚本使用高效的DOM操作，对页面性能影响很小
   - 只在检测到相关元素时才执行修复操作

4. **与其他脚本冲突**
   - 若与其他脚本冲突，尝试禁用其他脚本后再测试
   - 或调整脚本的执行顺序

## 技术细节
- **选择器**：使用 `[class*="CourseItemInfoText"]` 和 `[class*="courseLi"]` 等选择器，支持动态生成的类名
- **监控范围**：监控整个文档的DOM变化，确保动态加载的内容也能被修复
- **错误处理**：静默处理错误，确保脚本不会因为个别元素的问题而停止运行
- **日志输出**：只在必要时输出修复统计信息，避免控制台刷屏
