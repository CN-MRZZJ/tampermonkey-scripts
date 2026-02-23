// ==UserScript==
// @name         BISTU教务系统主页渲染修复
// @namespace    https://github.com/CN-MRZZJ/tampermonkey-scripts
// @version      1.0.0
// @description  修复BISTU教务系统主页课程信息的HTML渲染问题
// @author       MRZZJ
// @match        https://jwxt.bistu.edu.cn/jwapp/sys/homeapp/home/index.html*
// @grant        none
// @run-at       document-end
// @unwrap
// @license      MIT
// @homepageURL  https://github.com/CN-MRZZJ/tampermonkey-scripts
// @supportURL   https://github.com/CN-MRZZJ/tampermonkey-scripts/issues
// @updateURL    https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-fix-rendering.user.js
// @downloadURL  https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-fix-rendering.user.js
// @icon         https://info.bistu.edu.cn//home/icon.jpg
// ==/UserScript==


(function() {
    'use strict';

    // 修复HTML渲染问题的函数
    function fixRendering() {
        // 直接查找课程信息元素
        const courseInfoElements = document.querySelectorAll('[class*="CourseItemInfoText"]');
        let fixedCount = 0;
        
        courseInfoElements.forEach((element) => {
            try {
                // 检查是否包含链接
                const links = element.querySelectorAll('a[data-kblx]');
                if (links.length === 0) {
                    // 尝试直接设置innerHTML为当前textContent
                    const text = element.textContent || element.innerText || '';
                    if (text) {
                        element.innerHTML = text;
                        fixedCount++;
                    }
                }
            } catch (error) {
                // 静默处理错误
            }
        });
        
        // 处理tooltip中的元素
        const tooltipElements = document.querySelectorAll('.ant-tooltip-inner');
        tooltipElements.forEach((tooltip) => {
            const courseLiElements = tooltip.querySelectorAll('[class*="courseLi"]');
            courseLiElements.forEach((element) => {
                try {
                    // 检查是否包含链接
                    const links = element.querySelectorAll('a[data-kblx]');
                    if (links.length === 0) {
                        const text = element.textContent || element.innerText || '';
                        if (text) {
                            element.innerHTML = text;
                            fixedCount++;
                        }
                    }
                } catch (error) {
                    // 静默处理错误
                }
            });
        });
        
        if (fixedCount > 0) {
            console.log(`修复了 ${fixedCount} 个元素的渲染问题`);
        }
    }

    // 监听页面变化，处理单页应用的路由变化
    function observePageChanges() {
        const observer = new MutationObserver((mutations) => {
            let shouldFix = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 检查是否是课程相关元素
                            if (node.classList) {
                                const className = node.className;
                                if (/CourseItemInfoText|courseLi/.test(className)) {
                                    shouldFix = true;
                                }
                            }
                            
                            // 检查子元素
                            const courseInfoElements = node.querySelectorAll('[class*="CourseItemInfoText"], [class*="courseLi"]');
                            if (courseInfoElements.length > 0) {
                                shouldFix = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldFix) {
                setTimeout(fixRendering, 300);
            }
        });
        
        // 观察整个文档的变化
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log("BISTU教务系统主页渲染修复脚本已启动");
    }

    // 页面加载完成后执行修复
    function initFix() {
        // 延迟执行，确保页面完全加载
        setTimeout(function() {
            fixRendering();
        }, 2000);
        
        // 设置页面变化监听器
        observePageChanges();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initFix();
        });
    } else {
        initFix();
    }

    // 额外的延迟执行，确保动态内容加载完成
    setTimeout(function() {
        fixRendering();
    }, 5000);
})();